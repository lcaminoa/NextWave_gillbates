"""Historical incident memory with conservative, explainable matching.

Memory is deliberately kept outside detection and RCA scoring.  It stores only a compact,
structured fingerprint of an already-resolved, evidence-backed incident.  A match may populate
``IncidentReport.matches_past_incident_id`` as context for an operator; it never changes the
current winner, confidence, claims, evidence IDs, or recommended action.
"""

from __future__ import annotations

import json
import math
import sqlite3
import threading
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

from contracts.schemas import Anomaly, IncidentCandidate, IncidentReport, ReportStatus


MIN_MEMORY_SIMILARITY = 0.85
MAX_DECLINE_DELTA_GAP_PP = 15.0


@dataclass(frozen=True)
class IncidentFingerprint:
    """The small, non-evidentiary summary used for historical comparison."""

    dimensions: tuple[tuple[str, str], ...]
    dominant_decline_code: str | None
    decline_delta_pp: float
    time_bucket: int
    impact_log: float


@dataclass(frozen=True)
class MemoryMatch:
    """One prior incident that is structurally close enough to mention as context."""

    incident_id: str
    similarity: float
    resolved_at: datetime
    summary: str
    recommended_action: str


class IncidentMemory(Protocol):
    """Small boundary between Stream C/runtime and the persistence implementation."""

    def find_similar(
        self,
        anomaly: Anomaly,
        report: IncidentReport,
        candidates: Sequence[IncidentCandidate],
    ) -> MemoryMatch | None: ...

    def record_resolved(
        self,
        anomaly: Anomaly,
        report: IncidentReport,
        candidates: Sequence[IncidentCandidate],
    ) -> bool: ...


class NullIncidentMemory:
    """Safe default for isolated unit tests and callers that do not need persistence."""

    def find_similar(
        self,
        anomaly: Anomaly,
        report: IncidentReport,
        candidates: Sequence[IncidentCandidate],
    ) -> MemoryMatch | None:
        return None

    def record_resolved(
        self,
        anomaly: Anomaly,
        report: IncidentReport,
        candidates: Sequence[IncidentCandidate],
    ) -> bool:
        return False


def _winner(
    report: IncidentReport,
    candidates: Sequence[IncidentCandidate],
) -> IncidentCandidate | None:
    if report.status is ReportStatus.inconclusive or report.winning_candidate_id is None:
        return None
    return next(
        (item for item in candidates if item.candidate_id == report.winning_candidate_id),
        None,
    )


def build_fingerprint(
    anomaly: Anomaly,
    report: IncidentReport,
    candidates: Sequence[IncidentCandidate],
) -> IncidentFingerprint | None:
    """Build a fingerprint only when the current RCA has a publishable winner."""
    winner = _winner(report, candidates)
    if winner is None:
        return None

    dimensions = tuple(
        sorted(
            (str(key), str(value))
            for key, value in winner.dimensions.model_dump(exclude_none=True).items()
        )
    )
    if not dimensions:
        return None

    return IncidentFingerprint(
        dimensions=dimensions,
        dominant_decline_code=winner.dominant_decline_code,
        decline_delta_pp=round(
            (winner.current_decline_rate - winner.baseline_decline_rate) * 100,
            4,
        ),
        # Four coarse time bands are enough to distinguish a repeated time profile without
        # pretending that two incidents are identical because they happened at the same minute.
        time_bucket=anomaly.window_start.hour // 6,
        impact_log=round(
            math.log10(max(1.0, report.estimated_revenue_loss_usd_per_hour)),
            4,
        ),
    )


def _similarity(
    current: IncidentFingerprint,
    historical: IncidentFingerprint,
) -> float | None:
    """Return a conservative structural similarity, or ``None`` for incompatible roots."""
    # Root dimensions are the strongest protection against treating a related symptom as a
    # recurrence.  We intentionally require an exact set, not merely an overlapping provider.
    if current.dimensions != historical.dimensions:
        return None

    # A known, conflicting decline code means the mechanism changed.  If either incident does
    # not have one, it remains usable context but receives less credit below.
    if (
        current.dominant_decline_code is not None
        and historical.dominant_decline_code is not None
        and current.dominant_decline_code != historical.dominant_decline_code
    ):
        return None

    decline_gap = abs(current.decline_delta_pp - historical.decline_delta_pp)
    if decline_gap > MAX_DECLINE_DELTA_GAP_PP:
        return None

    decline_similarity = 1.0 - (decline_gap / MAX_DECLINE_DELTA_GAP_PP)
    code_similarity = (
        1.0
        if current.dominant_decline_code == historical.dominant_decline_code
        else 0.5
    )
    impact_similarity = max(
        0.0,
        1.0 - min(abs(current.impact_log - historical.impact_log) / 2.0, 1.0),
    )
    time_similarity = 1.0 if current.time_bucket == historical.time_bucket else 0.0

    return round(
        0.60 + 0.15 * code_similarity + 0.18 * decline_similarity
        + 0.04 * time_similarity + 0.03 * impact_similarity,
        4,
    )


class SQLiteIncidentMemory:
    """Thread-safe SQLite memory for resolved incidents in a single Control Tower process."""

    def __init__(self, database_path: str | Path = ":memory:") -> None:
        raw_path = str(database_path)
        if raw_path != ":memory:":
            path = Path(raw_path).expanduser()
            path.parent.mkdir(parents=True, exist_ok=True)
            raw_path = str(path)

        self.database_path = raw_path
        self._lock = threading.RLock()
        self._connection = sqlite3.connect(raw_path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        with self._lock:
            self._connection.execute(
                """
                CREATE TABLE IF NOT EXISTS historical_incidents (
                    incident_id TEXT PRIMARY KEY,
                    resolved_at TEXT NOT NULL,
                    dimensions_json TEXT NOT NULL,
                    dominant_decline_code TEXT,
                    decline_delta_pp REAL NOT NULL,
                    time_bucket INTEGER NOT NULL,
                    impact_log REAL NOT NULL,
                    summary TEXT NOT NULL,
                    recommended_action TEXT NOT NULL
                )
                """
            )
            self._connection.commit()

    @property
    def count(self) -> int:
        with self._lock:
            row = self._connection.execute(
                "SELECT COUNT(*) AS count FROM historical_incidents"
            ).fetchone()
        return int(row["count"])

    def record_resolved(
        self,
        anomaly: Anomaly,
        report: IncidentReport,
        candidates: Sequence[IncidentCandidate],
    ) -> bool:
        """Persist a resolved report.  Inconclusive and winner-less reports are never stored."""
        fingerprint = build_fingerprint(anomaly, report, candidates)
        if fingerprint is None:
            return False

        resolved_at = report.generated_at.astimezone(timezone.utc).isoformat()
        with self._lock:
            self._connection.execute(
                """
                INSERT INTO historical_incidents (
                    incident_id, resolved_at, dimensions_json, dominant_decline_code,
                    decline_delta_pp, time_bucket, impact_log, summary, recommended_action
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(incident_id) DO UPDATE SET
                    resolved_at = excluded.resolved_at,
                    dimensions_json = excluded.dimensions_json,
                    dominant_decline_code = excluded.dominant_decline_code,
                    decline_delta_pp = excluded.decline_delta_pp,
                    time_bucket = excluded.time_bucket,
                    impact_log = excluded.impact_log,
                    summary = excluded.summary,
                    recommended_action = excluded.recommended_action
                """,
                (
                    report.incident_id,
                    resolved_at,
                    json.dumps(dict(fingerprint.dimensions), sort_keys=True),
                    fingerprint.dominant_decline_code,
                    fingerprint.decline_delta_pp,
                    fingerprint.time_bucket,
                    fingerprint.impact_log,
                    report.summary,
                    report.recommended_action,
                ),
            )
            self._connection.commit()
        return True

    def find_similar(
        self,
        anomaly: Anomaly,
        report: IncidentReport,
        candidates: Sequence[IncidentCandidate],
    ) -> MemoryMatch | None:
        """Find the closest previous root without exposing it as current incident evidence."""
        fingerprint = build_fingerprint(anomaly, report, candidates)
        if fingerprint is None:
            return None

        with self._lock:
            rows = self._connection.execute(
                """
                SELECT incident_id, resolved_at, dimensions_json, dominant_decline_code,
                       decline_delta_pp, time_bucket, impact_log, summary, recommended_action
                FROM historical_incidents
                WHERE incident_id != ?
                ORDER BY resolved_at DESC
                """,
                (report.incident_id,),
            ).fetchall()

        best: MemoryMatch | None = None
        for row in rows:
            stored = IncidentFingerprint(
                dimensions=tuple(
                    sorted(
                        (str(key), str(value))
                        for key, value in json.loads(row["dimensions_json"]).items()
                    )
                ),
                dominant_decline_code=row["dominant_decline_code"],
                decline_delta_pp=float(row["decline_delta_pp"]),
                time_bucket=int(row["time_bucket"]),
                impact_log=float(row["impact_log"]),
            )
            similarity = _similarity(fingerprint, stored)
            if similarity is None or similarity < MIN_MEMORY_SIMILARITY:
                continue

            resolved_at = datetime.fromisoformat(str(row["resolved_at"]))
            match = MemoryMatch(
                incident_id=str(row["incident_id"]),
                similarity=similarity,
                resolved_at=resolved_at,
                summary=str(row["summary"]),
                recommended_action=str(row["recommended_action"]),
            )
            if best is None or match.similarity > best.similarity:
                best = match
        return best
