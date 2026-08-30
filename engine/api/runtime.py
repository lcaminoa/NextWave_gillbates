"""One in-memory runtime connecting simulator, detection/RCA and Stream C.

The runtime owns exactly one live simulator and one detection pipeline. HTTP clients subscribe
to a fan-out broker; they never create or advance their own simulator. Incident state is kept in
memory for the hackathon demo and is deliberately isolated from the shared contract models.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import math
import threading
import time
from collections import deque
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Protocol

from contracts.schemas import (
    Anomaly,
    ChaosMode,
    ChaosSpec,
    Evidence,
    IncidentCandidate,
    IncidentReport,
    Transaction,
)
from engine.api.assurance import (
    PublicationReason,
    completed_audit_view,
    error_audit_view,
    evaluate_blind_trial,
    not_run_audit_view,
)
from engine.api.models import (
    BlindTrialEvaluation,
    ChaosRevealResponse,
    EvidenceAuditView,
    IncidentDetail,
    NotificationDispatchView,
)
from engine.detection.pipeline import AnomalyDiagnosis, DetectionPipeline, WindowResult
from engine.investigator import (
    AuditedInvestigationResult,
    InvestigationResult,
    run_investigation,
)
from engine.investigator.memory import IncidentMemory, NullIncidentMemory
from engine.investigator.validation import validate_report
from engine.notifications import NotificationService
from simulator import PaymentSimulator


logger = logging.getLogger(__name__)
MAX_CHAOS_DURATION_MINUTES = 60
DEFAULT_MAX_CHAOS_SPECS = 20


class Pipeline(Protocol):
    def ingest(self, transaction: Transaction) -> list[WindowResult]: ...

    def flush(self) -> WindowResult | None: ...


Investigator = Callable[
    [str, Sequence[IncidentCandidate], Sequence[Evidence]],
    InvestigationResult,
]
AuditedInvestigator = Callable[
    [Anomaly, Sequence[IncidentCandidate], Sequence[Evidence]],
    AuditedInvestigationResult,
]


class NotificationSink(Protocol):
    """Internal boundary so notification failures never couple to the runtime core."""

    def start(self) -> None: ...

    def stop(self) -> None: ...

    def enqueue_report(self, report: IncidentReport, *, episode_key: str) -> object: ...

    def records_for_incident(self, incident_id: str) -> list[object]: ...


@dataclass(frozen=True)
class StoredIncident:
    anomaly: Anomaly
    candidates: tuple[IncidentCandidate, ...]
    evidence: tuple[Evidence, ...]
    investigation: InvestigationResult
    evidence_audit: EvidenceAuditView
    publication_reason: PublicationReason
    retryable: bool = False

    def detail(
        self,
        notification_dispatches: list[NotificationDispatchView] | None = None,
    ) -> IncidentDetail:
        return IncidentDetail(
            report=self.investigation.report,
            candidates=list(self.candidates),
            evidence=list(self.evidence),
            investigation_steps=list(self.investigation.steps),
            evidence_audit=self.evidence_audit,
            notification_dispatches=list(notification_dispatches or []),
        )


@dataclass(frozen=True)
class DiagnosisGroup:
    fingerprint: str
    match_fingerprint: str
    representative: AnomalyDiagnosis
    direct: bool


@dataclass(frozen=True)
class InvestigationSelection:
    fingerprint: str
    match_fingerprint: str
    direct: bool
    diagnosis: AnomalyDiagnosis
    existing_id: str | None
    promotes_provisional: bool = False


@dataclass
class BlindTrialRun:
    """Pre-reveal association state that deliberately contains no secret dimensions."""

    chaos_id: str
    virtual_started_at: datetime
    virtual_ends_at: datetime | None
    known_fingerprints: frozenset[str]
    wall_started_at: float
    fingerprint: str | None = None
    incident_id: str | None = None
    detection_wall_at: float | None = None
    report_wall_at: float | None = None
    ambiguous: bool = False
    evaluation: BlindTrialEvaluation | None = None


class TransactionBroker:
    """Non-blocking SSE fan-out with a small replay buffer for new clients."""

    def __init__(self, *, replay_size: int = 100, subscriber_queue_size: int = 256) -> None:
        if replay_size < 0:
            raise ValueError("replay_size cannot be negative")
        if subscriber_queue_size < max(1, replay_size):
            raise ValueError("subscriber_queue_size must fit the replay buffer")
        self._replay: deque[Transaction] = deque(maxlen=replay_size)
        self._subscriber_queue_size = subscriber_queue_size
        self._subscribers: set[asyncio.Queue[Transaction | None]] = set()
        self._closed = False

    @property
    def closed(self) -> bool:
        return self._closed

    def publish(self, transaction: Transaction) -> None:
        if self._closed:
            return
        self._replay.append(transaction)
        for queue in tuple(self._subscribers):
            if queue.full():
                queue.get_nowait()
            queue.put_nowait(transaction)

    def subscribe(self, *, after_transaction_id: str | None = None) -> asyncio.Queue[Transaction | None]:
        queue: asyncio.Queue[Transaction | None] = asyncio.Queue(
            maxsize=self._subscriber_queue_size
        )
        replay = list(self._replay)
        if after_transaction_id is not None:
            matching_index = next(
                (
                    index
                    for index, transaction in enumerate(replay)
                    if transaction.transaction_id == after_transaction_id
                ),
                None,
            )
            if matching_index is not None:
                replay = replay[matching_index + 1 :]
        for transaction in replay:
            queue.put_nowait(transaction)
        if self._closed:
            if queue.full():
                queue.get_nowait()
            queue.put_nowait(None)
        else:
            self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[Transaction | None]) -> None:
        self._subscribers.discard(queue)

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        for queue in tuple(self._subscribers):
            if queue.full():
                queue.get_nowait()
            queue.put_nowait(None)
        self._subscribers.clear()

    def reopen(self) -> None:
        if not self._closed:
            return
        self._replay.clear()
        self._closed = False


def _dimension_values(dimension_key: str) -> dict[str, str]:
    if dimension_key == "global":
        return {}
    return dict(part.split("=", 1) for part in dimension_key.split("|"))


def _candidate_covers_anomaly(
    candidate: IncidentCandidate,
    anomaly: Anomaly,
) -> bool:
    anomaly_dimensions = _dimension_values(anomaly.dimension_key)
    candidate_dimensions = candidate.dimensions.model_dump(exclude_none=True)
    return all(candidate_dimensions.get(key) == value for key, value in anomaly_dimensions.items())


def _align_investigation_clock(
    investigation: InvestigationResult,
    anomaly: Anomaly,
) -> InvestigationResult:
    """Keep accelerated simulator timestamps coherent with report/step timestamps.

    Stream C timestamps its work with the wall clock. The demo advances transaction time faster
    than wall time, so an otherwise valid report could appear to have been generated before its
    anomaly. Only timestamps are adjusted; tool calls, claims and evidence remain untouched.
    """
    timestamps = [investigation.report.generated_at]
    timestamps.extend(step.timestamp for step in investigation.steps)
    if all(timestamp >= anomaly.detected_at for timestamp in timestamps):
        return investigation

    base = max(anomaly.detected_at, investigation.report.generated_at)
    aligned_steps = tuple(
        step.model_copy(update={"timestamp": base + timedelta(microseconds=index)})
        for index, step in enumerate(investigation.steps, start=1)
    )
    aligned_report = investigation.report.model_copy(
        update={
            "generated_at": base + timedelta(microseconds=len(aligned_steps) + 1),
        }
    )
    return InvestigationResult(
        report=aligned_report,
        steps=aligned_steps,
        consulted_evidence_ids=investigation.consulted_evidence_ids,
        tool_calls=investigation.tool_calls,
    )


DimensionSignature = tuple[tuple[str, str], ...]


def _dimension_signature(dimension_key: str) -> DimensionSignature:
    return tuple(sorted(_dimension_values(dimension_key).items()))


def _candidate_signature(candidate: IncidentCandidate) -> DimensionSignature:
    return tuple(sorted(candidate.dimensions.model_dump(exclude_none=True).items()))


def _signature_key(signature: DimensionSignature) -> str:
    return (
        "|".join(f"{key}={value}" for key, value in signature)
        if signature
        else "global"
    )


def _signature_contains(
    container: DimensionSignature,
    contained: DimensionSignature,
) -> bool:
    values = dict(container)
    return all(values.get(key) == value for key, value in contained)


def _fingerprints_are_nested(left: str, right: str) -> bool:
    if left == "global" or right == "global":
        return left == right
    left_signature = _dimension_signature(left)
    right_signature = _dimension_signature(right)
    return _signature_contains(left_signature, right_signature) or _signature_contains(
        right_signature, left_signature
    )


def _root_proposal(
    diagnosis: AnomalyDiagnosis,
) -> tuple[DimensionSignature, bool]:
    """Return a supported top RCA signature and whether it is unambiguous.

    Weak candidates must never bridge diagnoses. A proposal is based only on the highest RCA
    score whose evidence is actually present in this diagnosis. Equal top scores for incompatible
    signatures are treated as ambiguous and fall back to the observed anomaly segment.
    """
    evidence_ids = {item.evidence_id for item in diagnosis.evidence}
    supported = [
        candidate
        for candidate in diagnosis.candidates
        if candidate.evidence_ids
        and set(candidate.evidence_ids).issubset(evidence_ids)
    ]
    if not supported:
        return _dimension_signature(diagnosis.anomaly.dimension_key), False

    top_score = max(candidate.rca_score for candidate in supported)
    top_signatures = {
        _candidate_signature(candidate)
        for candidate in supported
        if candidate.rca_score == top_score
    }
    if len(top_signatures) != 1:
        return _dimension_signature(diagnosis.anomaly.dimension_key), False
    return next(iter(top_signatures)), True


def _representative_score(diagnosis: AnomalyDiagnosis) -> tuple[float, float, int, int]:
    candidates = diagnosis.candidates
    return (
        max(
            (candidate.estimated_revenue_loss_usd_per_hour for candidate in candidates),
            default=0.0,
        ),
        max((candidate.rca_score for candidate in candidates), default=0.0),
        diagnosis.anomaly.volume,
        -len(_dimension_values(diagnosis.anomaly.dimension_key)),
    )


def _cluster_diagnoses(
    diagnoses: Sequence[AnomalyDiagnosis],
) -> list[DiagnosisGroup]:
    """Collapse symptoms around direct, independently supported RCA anchors.

    A provider incident can trigger provider, country, bank and intersection anomalies in one
    window. Only a diagnosis whose unambiguous top candidate equals its own anomaly segment can
    anchor a group. A satellite joins one compatible anchor; a candidate compatible with multiple
    anchors is ignored rather than joining independent incidents. With no compatible anchor, the
    proposal stays provisional and independent. Global is omitted whenever segmented evidence
    exists because its broad candidate pool cannot safely assign ownership.
    """
    segmented = [
        diagnosis for diagnosis in diagnoses if diagnosis.anomaly.dimension_key != "global"
    ]
    eligible = segmented or list(diagnoses)
    proposals = [
        (diagnosis, *_root_proposal(diagnosis))
        for diagnosis in eligible
    ]
    anchors: dict[DimensionSignature, list[AnomalyDiagnosis]] = {}
    satellites: list[tuple[AnomalyDiagnosis, DimensionSignature]] = []
    for diagnosis, proposal, clear in proposals:
        anomaly_signature = _dimension_signature(diagnosis.anomaly.dimension_key)
        if clear and proposal == anomaly_signature:
            anchors.setdefault(proposal, []).append(diagnosis)
        else:
            satellites.append((diagnosis, proposal))

    provisional: list[tuple[AnomalyDiagnosis, DimensionSignature]] = []
    for diagnosis, proposal in satellites:
        compatible_anchors = [
            anchor
            for anchor in anchors
            if _signature_contains(proposal, anchor)
        ]
        if len(compatible_anchors) == 1:
            # The direct anchor remains the publication source. The satellite proves that the
            # same root has another symptom, but its separate anomaly/evidence packet cannot be
            # merged without inventing a cross-anomaly contract.
            continue
        if len(compatible_anchors) > 1:
            continue
        provisional.append((diagnosis, proposal))

    groups = [
        DiagnosisGroup(
            fingerprint=_signature_key(signature),
            match_fingerprint=_signature_key(signature),
            representative=max(group, key=_representative_score),
            direct=True,
        )
        for signature, group in anchors.items()
    ]
    groups.extend(
        DiagnosisGroup(
            fingerprint=_signature_key(
                _dimension_signature(diagnosis.anomaly.dimension_key)
            ),
            match_fingerprint=_signature_key(proposal),
            representative=diagnosis,
            direct=False,
        )
        for diagnosis, proposal in provisional
    )
    return sorted(groups, key=lambda group: group.fingerprint)


class ControlTowerService:
    """Stateful vertical slice used by the FastAPI application.

    A repeated ``dimension_key`` remains one active episode while diagnosed windows continue to
    contain it. Two windows without that diagnosis release the fingerprint so a later recurrence
    can create a new incident; the grace avoids treating one low-volume window as recovery.
    ``anomaly_id`` is intentionally not used for deduplication because Stream B creates a fresh
    one per sustained window.
    """

    def __init__(
        self,
        *,
        simulator: PaymentSimulator | None = None,
        pipeline: Pipeline | None = None,
        investigator: Investigator | None = None,
        audited_investigator: AuditedInvestigator | None = None,
        incident_memory: IncidentMemory | None = None,
        start_at: datetime | None = None,
        simulated_interval_seconds: float = 0.05,
        emit_delay_seconds: float = 0.005,
        broker: TransactionBroker | None = None,
        notifications: NotificationSink | None = None,
        max_chaos_specs: int = DEFAULT_MAX_CHAOS_SPECS,
        episode_grace_windows: int = 2,
        monotonic_clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if simulated_interval_seconds <= 0:
            raise ValueError("simulated_interval_seconds must be positive")
        if emit_delay_seconds < 0:
            raise ValueError("emit_delay_seconds cannot be negative")
        if max_chaos_specs < 1:
            raise ValueError("max_chaos_specs must be positive")
        if episode_grace_windows < 1:
            raise ValueError("episode_grace_windows must be positive")
        if investigator is not None and audited_investigator is not None:
            raise ValueError("configure either investigator or audited_investigator, not both")

        current = start_at or datetime.now(timezone.utc).replace(microsecond=0)
        if current.tzinfo is None or current.utcoffset() is None:
            raise ValueError("start_at must include a timezone")

        self.simulator = simulator or PaymentSimulator(seed=200)
        if pipeline is None:
            history = PaymentSimulator(seed=100).generate(
                current - timedelta(hours=1),
                count=1_500,
                interval_seconds=0.2,
            )
            pipeline = DetectionPipeline(history=history)
        self.pipeline = pipeline
        self.investigator = investigator or run_investigation
        self.audited_investigator = audited_investigator
        self.incident_memory = incident_memory or NullIncidentMemory()
        self.current_timestamp = current
        self.simulated_interval_seconds = simulated_interval_seconds
        self.emit_delay_seconds = emit_delay_seconds
        self.broker = broker or TransactionBroker()
        self.notifications = notifications or NotificationService.from_environment()
        self.max_chaos_specs = max_chaos_specs
        self.episode_grace_windows = episode_grace_windows
        self._monotonic_clock = monotonic_clock

        self._incidents: dict[str, StoredIncident] = {}
        self._active_episodes: dict[str, str] = {}
        self._episode_match_fingerprints: dict[str, str] = {}
        self._episode_direct: dict[str, bool] = {}
        self._episode_notification_keys: dict[str, str] = {}
        self._episode_misses: dict[str, int] = {}
        self._pending_episodes: set[str] = set()
        self._api_chaos_ids: set[str] = set()
        self._blind_trials: dict[str, BlindTrialRun] = {}
        self._producer_task: asyncio.Task[None] | None = None
        self._investigator_task: asyncio.Task[None] | None = None
        self._investigation_queue: asyncio.Queue[InvestigationSelection] | None = None
        self._producer_error: str | None = None
        self._investigator_error: str | None = None
        self._producer_stop = threading.Event()
        self._simulator_lock = threading.Lock()

    @property
    def health_status(self) -> str:
        return (
            "degraded"
            if self._producer_error is not None or self._investigator_error is not None
            else "ok"
        )

    async def start(self) -> None:
        if self._producer_task is not None and not self._producer_task.done():
            return
        old_investigator_task = self._investigator_task
        if old_investigator_task is not None and not old_investigator_task.done():
            old_investigator_task.cancel()
            try:
                await old_investigator_task
            except asyncio.CancelledError:
                pass
        self.broker.reopen()
        self._producer_error = None
        self._investigator_error = None
        self._producer_stop.clear()
        self._pending_episodes.clear()
        self._active_episodes = {
            fingerprint: incident_id
            for fingerprint, incident_id in self._active_episodes.items()
            if incident_id
        }
        self._episode_match_fingerprints = {
            fingerprint: self._episode_match_fingerprints.get(
                fingerprint,
                fingerprint,
            )
            for fingerprint in self._active_episodes
        }
        self._episode_direct = {
            fingerprint: self._episode_direct.get(fingerprint, False)
            for fingerprint in self._active_episodes
        }
        self._episode_notification_keys = {
            fingerprint: episode_key
            for fingerprint, episode_key in self._episode_notification_keys.items()
            if fingerprint in self._active_episodes
        }
        self._investigation_queue = asyncio.Queue()
        try:
            self.notifications.start()
        except Exception:
            logger.exception("Control Tower notification worker could not start")
        self._investigator_task = asyncio.create_task(
            self._investigate_forever(), name="control-tower-investigator-worker"
        )
        self._producer_task = asyncio.create_task(
            self._produce_forever(), name="control-tower-transaction-producer"
        )

    async def stop(self) -> None:
        task = self._producer_task
        self._producer_task = None
        self._producer_stop.set()
        if task is not None:
            await task

        try:
            final_window = self.pipeline.flush()
            if final_window is not None:
                self._enqueue_window(final_window)
        except Exception as exc:
            self._producer_error = type(exc).__name__
            logger.exception("Control Tower pipeline flush failed")

        queue = self._investigation_queue
        if queue is not None:
            try:
                await asyncio.wait_for(queue.join(), timeout=5.0)
            except asyncio.TimeoutError:
                self._investigator_error = "ShutdownTimeout"

        investigator_task = self._investigator_task
        self._investigator_task = None
        if investigator_task is not None:
            investigator_task.cancel()
            try:
                await investigator_task
            except asyncio.CancelledError:
                pass
        self._investigation_queue = None
        try:
            self.notifications.stop()
        except Exception:
            logger.exception("Control Tower notification worker could not stop")
        self.broker.close()

    async def _produce_forever(self) -> None:
        try:
            loop = asyncio.get_running_loop()
            await asyncio.to_thread(self._produce_in_thread, loop)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            self._producer_error = type(exc).__name__
            self.broker.close()
            logger.exception("Control Tower transaction producer stopped unexpectedly")

    def _produce_in_thread(self, loop: asyncio.AbstractEventLoop) -> None:
        while not self._producer_stop.is_set():
            with self._simulator_lock:
                transaction = self.simulator.next_transaction(self.current_timestamp)
                self.current_timestamp += timedelta(seconds=self.simulated_interval_seconds)
            results = self.pipeline.ingest(transaction)
            loop.call_soon_threadsafe(self._publish_producer_output, transaction, results)
            self._producer_stop.wait(self.emit_delay_seconds)

    def _publish_producer_output(
        self,
        transaction: Transaction,
        results: list[WindowResult],
    ) -> None:
        for result in results:
            self._enqueue_window(result)
        self.broker.publish(transaction)

    async def _investigate_forever(self) -> None:
        queue = self._investigation_queue
        if queue is None:
            return
        try:
            while True:
                selection = await queue.get()
                try:
                    stored = await asyncio.to_thread(
                        self._investigate,
                        selection.diagnosis,
                    )
                    still_active = selection.fingerprint in self._active_episodes
                    self._store_investigation(
                        selection,
                        stored,
                        activate=still_active,
                    )
                finally:
                    self._pending_episodes.discard(selection.fingerprint)
                    queue.task_done()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            self._investigator_error = type(exc).__name__
            logger.exception("Control Tower investigator worker stopped unexpectedly")

    def process_transaction(self, transaction: Transaction) -> list[WindowResult]:
        results = self.pipeline.ingest(transaction)
        for result in results:
            self.process_window(result)
        return results

    def process_window(self, result: WindowResult) -> None:
        for selection in self._select_diagnoses(result, reserve=False):
            stored = self._investigate(selection.diagnosis)
            self._store_investigation(
                selection,
                stored,
                activate=True,
            )

    def _enqueue_window(self, result: WindowResult) -> None:
        queue = self._investigation_queue
        if queue is None:
            raise RuntimeError("investigator worker is not running")
        for selection in self._select_diagnoses(result, reserve=True):
            queue.put_nowait(selection)

    def _select_diagnoses(
        self,
        result: WindowResult,
        *,
        reserve: bool,
    ) -> list[InvestigationSelection]:
        groups = _cluster_diagnoses(result.diagnoses)
        current_match_fingerprints = {
            group.match_fingerprint for group in groups
        }

        def active_identity(fingerprint: str) -> str:
            return self._episode_match_fingerprints.get(
                fingerprint,
                fingerprint,
            )

        def compatible_active(group: DiagnosisGroup) -> list[str]:
            return [
                active_fingerprint
                for active_fingerprint in self._active_episodes
                if _fingerprints_are_nested(
                    group.match_fingerprint,
                    active_identity(active_fingerprint),
                )
            ]

        def exact_active(group: DiagnosisGroup) -> list[str]:
            return [
                active_fingerprint
                for active_fingerprint in self._active_episodes
                if group.match_fingerprint == active_identity(active_fingerprint)
            ]

        diagnosed_fingerprints: set[str] = set()
        for group in groups:
            exact_matches = exact_active(group)
            if len(exact_matches) == 1:
                diagnosed_fingerprints.add(exact_matches[0])
                continue
            if not group.direct:
                matches = compatible_active(group)
                if len(matches) == 1:
                    diagnosed_fingerprints.add(matches[0])

        for fingerprint in tuple(self._active_episodes):
            if fingerprint in diagnosed_fingerprints:
                self._episode_misses[fingerprint] = 0
                continue
            misses = self._episode_misses.get(fingerprint, 0) + 1
            if misses >= self.episode_grace_windows:
                resolved_incident_id = self._active_episodes.pop(fingerprint, None)
                self._episode_match_fingerprints.pop(fingerprint, None)
                self._episode_direct.pop(fingerprint, None)
                self._episode_notification_keys.pop(fingerprint, None)
                self._episode_misses.pop(fingerprint, None)
                if resolved_incident_id:
                    self._remember_resolved_incident(resolved_incident_id)
            else:
                self._episode_misses[fingerprint] = misses

        resolved_groups: dict[
            str,
            tuple[DiagnosisGroup, bool],
        ] = {}
        for group in groups:
            promotes_provisional = False
            exact_matches = exact_active(group)
            if len(exact_matches) > 1:
                continue
            if len(exact_matches) == 1:
                resolved_fingerprint = exact_matches[0]
                promotes_provisional = (
                    group.direct
                    and not self._episode_direct.get(resolved_fingerprint, False)
                )
            else:
                matches = compatible_active(group)
                if group.direct:
                    if len(matches) > 1:
                        continue
                    if len(matches) == 1:
                        active_fingerprint = matches[0]
                        if not self._episode_direct.get(active_fingerprint, False):
                            resolved_fingerprint = active_fingerprint
                            promotes_provisional = True
                        else:
                            active_is_explicitly_present = (
                                active_identity(active_fingerprint)
                                in current_match_fingerprints
                            )
                            if not active_is_explicitly_present:
                                continue
                            resolved_fingerprint = group.fingerprint
                    else:
                        resolved_fingerprint = group.fingerprint
                else:
                    if len(matches) > 1:
                        continue
                    resolved_fingerprint = (
                        matches[0] if matches else group.fingerprint
                    )

            previous = resolved_groups.get(resolved_fingerprint)
            if previous is None or _representative_score(
                group.representative
            ) > _representative_score(previous[0].representative):
                resolved_groups[resolved_fingerprint] = (
                    group,
                    promotes_provisional,
                )

        selected: list[InvestigationSelection] = []
        for fingerprint, (group, promotes_provisional) in resolved_groups.items():
            diagnosis = group.representative
            if fingerprint in self._pending_episodes:
                continue
            existing_id = self._active_episodes.get(fingerprint)
            if existing_id is not None:
                existing = self._incidents.get(existing_id)
                if existing is None:
                    continue
                if not existing.retryable and not promotes_provisional:
                    continue
            selected.append(
                InvestigationSelection(
                    fingerprint=fingerprint,
                    match_fingerprint=group.match_fingerprint,
                    direct=group.direct,
                    diagnosis=diagnosis,
                    existing_id=existing_id,
                    promotes_provisional=promotes_provisional,
                )
            )
            if reserve:
                self._pending_episodes.add(fingerprint)
                if fingerprint not in self._active_episodes:
                    self._active_episodes[fingerprint] = ""
                    self._episode_match_fingerprints[fingerprint] = (
                        group.match_fingerprint
                    )
                    self._episode_direct[fingerprint] = group.direct
                    self._episode_notification_keys[fingerprint] = (
                        self._notification_episode_key(
                            fingerprint,
                            diagnosis.anomaly.anomaly_id,
                        )
                    )
                self._episode_misses[fingerprint] = 0
        self._associate_blind_trials(selected)
        return selected

    def _associate_blind_trials(
        self,
        selections: Sequence[InvestigationSelection],
    ) -> None:
        """Bind new episodes using time and fingerprints only, before any reveal.

        The method has no ChaosSpec parameter and BlindTrialRun stores neither dimensions nor
        severity. Ambiguous batches remain explicitly unbound instead of using truth later.
        """
        open_trials = [
            trial
            for trial in self._blind_trials.values()
            if trial.evaluation is None
            and not trial.ambiguous
            and trial.fingerprint is None
        ]
        if not open_trials or not selections:
            return

        candidates_by_trial: dict[str, list[InvestigationSelection]] = {}
        for trial in open_trials:
            eligible = []
            for selection in selections:
                anomaly = selection.diagnosis.anomaly
                if selection.fingerprint in trial.known_fingerprints:
                    continue
                if anomaly.window_end < trial.virtual_started_at:
                    continue
                if (
                    trial.virtual_ends_at is not None
                    and anomaly.window_start > trial.virtual_ends_at
                ):
                    continue
                eligible.append(selection)
            if eligible:
                candidates_by_trial[trial.chaos_id] = eligible

        observed_at = self._monotonic_clock()
        singleton_by_fingerprint: dict[str, list[BlindTrialRun]] = {}
        for chaos_id, candidates in candidates_by_trial.items():
            trial = self._blind_trials[chaos_id]
            if len(candidates) != 1:
                trial.ambiguous = True
                trial.detection_wall_at = observed_at
                continue
            singleton_by_fingerprint.setdefault(
                candidates[0].fingerprint,
                [],
            ).append(trial)

        for fingerprint, trials in singleton_by_fingerprint.items():
            if len(trials) != 1:
                for trial in trials:
                    trial.ambiguous = True
                    trial.detection_wall_at = observed_at
                continue
            trial = trials[0]
            trial.fingerprint = fingerprint
            trial.detection_wall_at = observed_at

    def _record_blind_trial_report(self, fingerprint: str, incident_id: str) -> None:
        recorded_at = self._monotonic_clock()
        for trial in self._blind_trials.values():
            if trial.evaluation is not None or trial.fingerprint != fingerprint:
                continue
            trial.incident_id = incident_id
            trial.report_wall_at = recorded_at

    def _store_investigation(
        self,
        selection: InvestigationSelection,
        stored: StoredIncident,
        *,
        activate: bool,
    ) -> None:
        if selection.existing_id and stored.retryable:
            return
        if selection.existing_id:
            self._incidents.pop(selection.existing_id, None)
        incident_id = stored.investigation.report.incident_id
        self._incidents[incident_id] = stored
        self._record_blind_trial_report(selection.fingerprint, incident_id)
        if activate:
            fingerprint = selection.fingerprint
            self._episode_notification_keys.setdefault(
                fingerprint,
                self._notification_episode_key(
                    fingerprint,
                    selection.diagnosis.anomaly.anomaly_id,
                ),
            )
            self._active_episodes[fingerprint] = incident_id
            if selection.direct or fingerprint not in self._episode_match_fingerprints:
                self._episode_match_fingerprints[fingerprint] = (
                    selection.match_fingerprint
                )
            self._episode_direct[fingerprint] = (
                self._episode_direct.get(fingerprint, False)
                or selection.direct
            )
            self._episode_misses[fingerprint] = 0
            if selection.direct and not stored.retryable:
                try:
                    self.notifications.enqueue_report(
                        stored.investigation.report,
                        episode_key=self._episode_notification_keys[fingerprint],
                    )
                except Exception:
                    # A report was already validated and published. An outbox fault must never
                    # suppress it or mark the control tower as unhealthy.
                    logger.exception(
                        "Control Tower could not queue an incident notification"
                    )

    @staticmethod
    def _notification_episode_key(fingerprint: str, initial_anomaly_id: str) -> str:
        """Opaque once-per-episode key; avoids persisting raw dimension values in the outbox."""

        material = f"pharos-notification-episode:v1:{fingerprint}:{initial_anomaly_id}"
        return hashlib.sha256(material.encode("utf-8")).hexdigest()

    def _remember_resolved_incident(self, incident_id: str) -> None:
        """Persist only a recovered, publishable episode; memory is never on the hot path."""
        stored = self._incidents.get(incident_id)
        if stored is None or stored.retryable:
            return
        try:
            self.incident_memory.record_resolved(
                stored.anomaly,
                stored.investigation.report,
                stored.candidates,
            )
        except Exception:
            # Historical context is useful but cannot make detection, RCA, or incident serving
            # unavailable.  The next recovery can try to write again.
            logger.exception("Control Tower could not persist historical incident memory")

    def _attach_historical_match(
        self,
        investigation: InvestigationResult,
        anomaly: Anomaly,
        candidates: tuple[IncidentCandidate, ...],
    ) -> InvestigationResult:
        """Attach a verified historical ID without letting memory influence current evidence."""
        # The report field is owned by this trusted runtime lookup.  A custom/LLM investigator
        # must not be able to invent a past incident ID in its structured output.
        report = investigation.report.model_copy(update={"matches_past_incident_id": None})
        clean_investigation = InvestigationResult(
            report=report,
            steps=investigation.steps,
            consulted_evidence_ids=investigation.consulted_evidence_ids,
            tool_calls=investigation.tool_calls,
        )
        try:
            match = self.incident_memory.find_similar(anomaly, report, candidates)
        except Exception:
            logger.exception("Control Tower could not search historical incident memory")
            return clean_investigation
        if match is None:
            return clean_investigation

        return InvestigationResult(
            report=report.model_copy(
                update={"matches_past_incident_id": match.incident_id}
            ),
            steps=investigation.steps,
            consulted_evidence_ids=investigation.consulted_evidence_ids,
            tool_calls=investigation.tool_calls,
        )

    def _investigate(self, diagnosis: AnomalyDiagnosis) -> StoredIncident:
        candidates = tuple(diagnosis.candidates)
        evidence = tuple(diagnosis.evidence)
        fully_covering_ids = {
            candidate.candidate_id
            for candidate in candidates
            if _candidate_covers_anomaly(candidate, diagnosis.anomaly)
        }

        retryable = False
        publication_reason: PublicationReason = "published"
        evidence_audit: EvidenceAuditView | None = None
        if candidates and not fully_covering_ids:
            investigation = run_investigation(diagnosis.anomaly.anomaly_id, (), ())
            publication_reason = "insufficient_candidate_coverage"
            evidence_audit = not_run_audit_view(
                investigation,
                summary=(
                    "The independent auditor was not run because no candidate covered the "
                    "detected anomaly dimensions."
                ),
            )
        else:
            if self.audited_investigator is not None:
                try:
                    audited = self.audited_investigator(
                        diagnosis.anomaly,
                        candidates,
                        evidence,
                    )
                    draft = audited.investigation
                    if draft.report.anomaly_id != diagnosis.anomaly.anomaly_id:
                        raise ValueError("investigator returned a report for another anomaly")
                    if draft.report.incident_id != f"inc_{diagnosis.anomaly.anomaly_id}":
                        raise ValueError("investigator returned an unexpected incident_id")
                    validate_report(
                        draft.report,
                        candidates=candidates,
                        evidence=evidence,
                        steps=draft.steps,
                        consulted_evidence_ids=draft.consulted_evidence_ids,
                    )
                    evidence_audit = completed_audit_view(audited.audit, draft)
                    if audited.audit.approved:
                        investigation = draft
                    else:
                        investigation = run_investigation(
                            diagnosis.anomaly.anomaly_id,
                            (),
                            (),
                        )
                        publication_reason = "audit_rejected"
                        retryable = True
                except Exception:
                    investigation = run_investigation(
                        diagnosis.anomaly.anomaly_id,
                        (),
                        (),
                    )
                    evidence_audit = error_audit_view(
                        summary=(
                            "The audited investigation did not return a safe publication "
                            "decision. PHAROS withheld the cause."
                        )
                    )
                    publication_reason = "audit_error"
                    retryable = True
            else:
                try:
                    investigation = self.investigator(
                        diagnosis.anomaly.anomaly_id,
                        candidates,
                        evidence,
                    )
                    if investigation.report.anomaly_id != diagnosis.anomaly.anomaly_id:
                        raise ValueError("investigator returned a report for another anomaly")
                    if investigation.report.incident_id != f"inc_{diagnosis.anomaly.anomaly_id}":
                        raise ValueError("investigator returned an unexpected incident_id")
                    validate_report(
                        investigation.report,
                        candidates=candidates,
                        evidence=evidence,
                        steps=investigation.steps,
                        consulted_evidence_ids=investigation.consulted_evidence_ids,
                    )
                    evidence_audit = not_run_audit_view(investigation)
                except Exception:
                    investigation = run_investigation(
                        diagnosis.anomaly.anomaly_id,
                        (),
                        (),
                    )
                    evidence_audit = not_run_audit_view(
                        investigation,
                        summary=(
                            "The deterministic investigation failed publication checks. "
                            "The independent auditor was not run."
                        ),
                    )
                    publication_reason = "investigation_error"
                    retryable = True

            winner_id = investigation.report.winning_candidate_id
            if winner_id is not None and winner_id not in fully_covering_ids:
                investigation = run_investigation(diagnosis.anomaly.anomaly_id, (), ())
                evidence_audit = error_audit_view(
                    summary=(
                        "The deterministic publication gate withheld a winner that did not "
                        "cover the detected anomaly."
                    )
                )
                publication_reason = "unproven_winner"
                retryable = True

        if (
            publication_reason == "published"
            and investigation.report.status.value == "inconclusive"
        ):
            publication_reason = "investigator_inconclusive"

        investigation = _align_investigation_clock(investigation, diagnosis.anomaly)
        investigation = self._attach_historical_match(
            investigation,
            diagnosis.anomaly,
            candidates,
        )
        validate_report(
            investigation.report,
            candidates=candidates,
            evidence=evidence,
            steps=investigation.steps,
            consulted_evidence_ids=investigation.consulted_evidence_ids,
        )
        if evidence_audit is None:
            evidence_audit = not_run_audit_view(investigation)

        return StoredIncident(
            anomaly=diagnosis.anomaly,
            candidates=candidates,
            evidence=evidence,
            investigation=investigation,
            evidence_audit=evidence_audit,
            publication_reason=publication_reason,
            retryable=retryable,
        )

    def list_reports(self) -> list[IncidentReport]:
        return [
            stored.investigation.report
            for stored in reversed(tuple(self._incidents.values()))
        ]

    def _notification_dispatches(self, incident_id: str) -> list[NotificationDispatchView]:
        """Project the outbox ledger for one incident.

        Read-only and best-effort: the alert channels are a side effect of an
        incident, never a precondition for reading one, so an outbox fault must
        degrade to "nothing to report" rather than fail the detail request.
        """
        reader = getattr(self.notifications, "records_for_incident", None)
        if reader is None:
            return []
        try:
            records = reader(incident_id)
        except Exception:  # pragma: no cover - defensive; the ledger is not the incident
            logger.exception("Control Tower could not read the notification ledger")
            return []

        views: list[NotificationDispatchView] = []
        for record in records:
            channel = getattr(record.channel, "value", record.channel)
            state = getattr(record.state, "value", record.state)
            views.append(
                NotificationDispatchView(
                    channel=channel,
                    state=state,
                    updated_at=record.updated_at,
                    attempt_count=record.attempt_count,
                    provider_reference=record.provider_message_id,
                    error_code=record.error_code,
                )
            )
        return views

    def get_incident(self, incident_id: str) -> IncidentDetail | None:
        stored = self._incidents.get(incident_id)
        if stored is None:
            return None
        return stored.detail(self._notification_dispatches(incident_id))

    def inject_manual(self, spec: ChaosSpec) -> ChaosSpec:
        if spec.mode is not ChaosMode.manual:
            raise ValueError("/api/chaos/inject only accepts mode=manual")
        self._validate_chaos_request(
            chaos_id=spec.chaos_id,
            severity_pp=spec.severity_pp,
            duration_minutes=spec.duration_minutes,
        )
        with self._simulator_lock:
            normalized = spec.model_copy(
                update={
                    "started_at": self.current_timestamp,
                    "revealed": True,
                }
            )
            self.simulator.chaos.inject(normalized)
        self._api_chaos_ids.add(normalized.chaos_id)
        public = self.simulator.chaos.public_spec(normalized.chaos_id)
        if public is None:
            raise RuntimeError("manual chaos was not stored")
        return public

    def inject_random(
        self,
        *,
        severity_pp: float,
        duration_minutes: int | None,
    ) -> ChaosSpec:
        self._validate_chaos_request(
            severity_pp=severity_pp,
            duration_minutes=duration_minutes,
        )
        with self._simulator_lock:
            internal = self.simulator.chaos.inject_random(
                severity_pp=severity_pp,
                started_at=self.current_timestamp,
                duration_minutes=duration_minutes,
            )
        self._api_chaos_ids.add(internal.chaos_id)
        self._blind_trials[internal.chaos_id] = BlindTrialRun(
            chaos_id=internal.chaos_id,
            virtual_started_at=internal.started_at,
            virtual_ends_at=(
                internal.started_at + timedelta(minutes=internal.duration_minutes)
                if internal.duration_minutes is not None
                else None
            ),
            known_fingerprints=frozenset(self._active_episodes),
            wall_started_at=self._monotonic_clock(),
        )
        public = self.simulator.chaos.public_spec(internal.chaos_id)
        if public is None:
            raise RuntimeError("random chaos was not stored")
        return public

    def reveal_chaos(self, chaos_id: str | None = None) -> ChaosRevealResponse | None:
        with self._simulator_lock:
            revealed = self.simulator.chaos.reveal(chaos_id)
        if revealed is None:
            return None

        trial = self._blind_trials.get(revealed.chaos_id)
        evaluation: BlindTrialEvaluation | None = None
        if trial is not None:
            if trial.evaluation is None:
                stored = (
                    self._incidents.get(trial.incident_id)
                    if trial.incident_id is not None
                    else None
                )
                trial.evaluation = evaluate_blind_trial(
                    revealed=revealed,
                    incident_id=trial.incident_id if stored is not None else None,
                    anomaly=stored.anomaly if stored is not None else None,
                    report=stored.investigation.report if stored is not None else None,
                    candidates=stored.candidates if stored is not None else (),
                    evidence_audit=stored.evidence_audit if stored is not None else None,
                    publication_reason=(
                        stored.publication_reason if stored is not None else None
                    ),
                    ambiguous=trial.ambiguous,
                    detection_latency_seconds=(
                        trial.detection_wall_at - trial.wall_started_at
                        if trial.detection_wall_at is not None
                        else None
                    ),
                    explanation_latency_seconds=(
                        trial.report_wall_at - trial.wall_started_at
                        if trial.report_wall_at is not None
                        else None
                    ),
                )
            evaluation = trial.evaluation
        return ChaosRevealResponse(
            **revealed.model_dump(),
            evaluation=evaluation,
        )

    def _validate_chaos_request(
        self,
        *,
        severity_pp: float,
        duration_minutes: int | None,
        chaos_id: str | None = None,
    ) -> None:
        if len(self._api_chaos_ids) >= self.max_chaos_specs:
            raise ValueError("chaos limit reached for this demo session")
        if chaos_id is not None and (
            chaos_id in self._api_chaos_ids
            or self.simulator.chaos.public_spec(chaos_id) is not None
        ):
            raise ValueError("chaos_id already exists")
        if not math.isfinite(severity_pp) or not 0 < abs(severity_pp) <= 95:
            raise ValueError("severity_pp must be finite and between 1 and 95")
        if duration_minutes is not None and not 0 < duration_minutes <= MAX_CHAOS_DURATION_MINUTES:
            raise ValueError(
                f"duration_minutes must be between 1 and {MAX_CHAOS_DURATION_MINUTES}"
            )
