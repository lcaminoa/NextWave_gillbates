"""Durable, local outbox for external incident notifications.

It is intentionally a small SQLite table instead of a queueing service: the hackathon runtime
already owns one process, and the outbox only needs to prevent duplicate operator alerts and make
the provider boundary observable. It stores no credentials or raw recipient address.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping

from engine.notifications.models import (
    DeliveryState,
    DispatchRecord,
    NotificationChannel,
    NotificationEvent,
    OutboundMessage,
)


_SCHEMA = """
CREATE TABLE IF NOT EXISTS notification_dispatches (
    dispatch_id TEXT PRIMARY KEY,
    dedupe_key TEXT NOT NULL UNIQUE,
    episode_key TEXT NOT NULL,
    incident_id TEXT NOT NULL,
    event TEXT NOT NULL,
    channel TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    recipient_fingerprint TEXT NOT NULL,
    state TEXT NOT NULL,
    subject TEXT NOT NULL,
    text_content TEXT NOT NULL,
    html_content TEXT NOT NULL,
    template_values_json TEXT NOT NULL,
    provider_message_id TEXT,
    error_code TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notification_dispatches_incident_idx
    ON notification_dispatches (incident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_dispatches_pending_idx
    ON notification_dispatches (state, created_at ASC);
"""


@dataclass(frozen=True)
class EnqueueResult:
    record: DispatchRecord
    created: bool


@dataclass(frozen=True)
class ClaimedDispatch:
    record: DispatchRecord
    message: OutboundMessage


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _timestamp(value: datetime) -> str:
    return value.isoformat()


def _parse_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("notification timestamp unexpectedly lacks a timezone")
    return parsed


class NotificationOutbox:
    """Thread-safe access to a single SQLite notification ledger."""

    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._initialization_lock = threading.Lock()
        self._initialized = False

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=5.0)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_initialized(self) -> None:
        with self._initialization_lock:
            if self._initialized:
                return
            self.database_path.parent.mkdir(parents=True, exist_ok=True)
            with self._connect() as connection:
                connection.executescript(_SCHEMA)
                connection.execute("PRAGMA journal_mode=WAL")
                # A process can stop after bytes left the machine but before it received a
                # provider receipt. Never retry that record automatically on the next startup.
                connection.execute(
                    """
                    UPDATE notification_dispatches
                    SET state = ?, error_code = ?, updated_at = ?
                    WHERE state = ?
                    """,
                    (
                        DeliveryState.unknown.value,
                        "interrupted_during_send",
                        _timestamp(_now()),
                        DeliveryState.sending.value,
                    ),
                )
            self._initialized = True

    @staticmethod
    def _record_from_row(row: sqlite3.Row) -> DispatchRecord:
        return DispatchRecord(
            dispatch_id=row["dispatch_id"],
            episode_key=row["episode_key"],
            incident_id=row["incident_id"],
            event=NotificationEvent(row["event"]),
            channel=NotificationChannel(row["channel"]),
            state=DeliveryState(row["state"]),
            provider_message_id=row["provider_message_id"],
            recipient_fingerprint=row["recipient_fingerprint"],
            error_code=row["error_code"],
            attempt_count=row["attempt_count"],
            created_at=_parse_timestamp(row["created_at"]),
            updated_at=_parse_timestamp(row["updated_at"]),
        )

    @staticmethod
    def _message_from_row(row: sqlite3.Row) -> OutboundMessage:
        raw_values = json.loads(row["template_values_json"])
        if not isinstance(raw_values, dict) or not all(
            isinstance(key, str) and isinstance(value, str)
            for key, value in raw_values.items()
        ):
            raise ValueError("notification template values are invalid")
        return OutboundMessage(
            dispatch_id=row["dispatch_id"],
            episode_key=row["episode_key"],
            incident_id=row["incident_id"],
            event=NotificationEvent(row["event"]),
            channel=NotificationChannel(row["channel"]),
            idempotency_key=row["idempotency_key"],
            subject=row["subject"],
            text=row["text_content"],
            html=row["html_content"],
            template_values=raw_values,
        )

    def enqueue(
        self,
        *,
        episode_key: str,
        incident_id: str,
        event: NotificationEvent,
        channel: NotificationChannel,
        dedupe_key: str,
        idempotency_key: str,
        recipient_fingerprint: str,
        subject: str,
        text: str,
        html: str,
        template_values: Mapping[str, str],
    ) -> EnqueueResult:
        self._ensure_initialized()
        timestamp = _timestamp(_now())
        dispatch_id = uuid.uuid4().hex
        with self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO notification_dispatches (
                    dispatch_id, dedupe_key, episode_key, incident_id, event, channel,
                    idempotency_key, recipient_fingerprint, state, subject, text_content,
                    html_content, template_values_json, provider_message_id, error_code,
                    attempt_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?)
                ON CONFLICT(dedupe_key) DO NOTHING
                """,
                (
                    dispatch_id,
                    dedupe_key,
                    episode_key,
                    incident_id,
                    event.value,
                    channel.value,
                    idempotency_key,
                    recipient_fingerprint,
                    DeliveryState.queued.value,
                    subject,
                    text,
                    html,
                    json.dumps(dict(template_values), sort_keys=True, separators=(",", ":")),
                    timestamp,
                    timestamp,
                ),
            )
            row = connection.execute(
                "SELECT * FROM notification_dispatches WHERE dedupe_key = ?",
                (dedupe_key,),
            ).fetchone()
        if row is None:
            raise RuntimeError("notification outbox failed to read its queued record")
        return EnqueueResult(
            record=self._record_from_row(row),
            created=cursor.rowcount == 1,
        )

    def claim_next(self) -> ClaimedDispatch | None:
        """Atomically turn one queued record into ``sending`` for a single worker."""

        self._ensure_initialized()
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                row = connection.execute(
                    """
                    SELECT * FROM notification_dispatches
                    WHERE state = ?
                    ORDER BY created_at ASC
                    LIMIT 1
                    """,
                    (DeliveryState.queued.value,),
                ).fetchone()
                if row is None:
                    connection.commit()
                    return None
                connection.execute(
                    """
                    UPDATE notification_dispatches
                    SET state = ?, attempt_count = attempt_count + 1, updated_at = ?
                    WHERE dispatch_id = ? AND state = ?
                    """,
                    (
                        DeliveryState.sending.value,
                        _timestamp(_now()),
                        row["dispatch_id"],
                        DeliveryState.queued.value,
                    ),
                )
                claimed = connection.execute(
                    "SELECT * FROM notification_dispatches WHERE dispatch_id = ?",
                    (row["dispatch_id"],),
                ).fetchone()
                connection.commit()
            except Exception:
                connection.rollback()
                raise
        if claimed is None:
            raise RuntimeError("notification outbox failed to claim a record")
        return ClaimedDispatch(
            record=self._record_from_row(claimed),
            message=self._message_from_row(claimed),
        )

    def mark(
        self,
        dispatch_id: str,
        *,
        state: DeliveryState,
        provider_message_id: str | None = None,
        error_code: str | None = None,
    ) -> DispatchRecord:
        if state not in {
            DeliveryState.accepted,
            DeliveryState.failed,
            DeliveryState.unknown,
            DeliveryState.skipped,
        }:
            raise ValueError("notification records can only finish in a terminal state")
        self._ensure_initialized()
        with self._connect() as connection:
            cursor = connection.execute(
                """
                UPDATE notification_dispatches
                SET state = ?, provider_message_id = ?, error_code = ?, updated_at = ?
                WHERE dispatch_id = ? AND state = ?
                """,
                (
                    state.value,
                    provider_message_id,
                    error_code,
                    _timestamp(_now()),
                    dispatch_id,
                    DeliveryState.sending.value,
                ),
            )
            row = connection.execute(
                "SELECT * FROM notification_dispatches WHERE dispatch_id = ?",
                (dispatch_id,),
            ).fetchone()
        if cursor.rowcount != 1 or row is None:
            raise RuntimeError("notification record was not in sending state")
        return self._record_from_row(row)

    def records_for_incident(self, incident_id: str) -> list[DispatchRecord]:
        self._ensure_initialized()
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM notification_dispatches
                WHERE incident_id = ?
                ORDER BY created_at ASC, channel ASC
                """,
                (incident_id,),
            ).fetchall()
        return [self._record_from_row(row) for row in rows]

    def all_records(self) -> list[DispatchRecord]:
        """Internal diagnostic seam used by deterministic tests and future operator UI."""

        self._ensure_initialized()
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM notification_dispatches ORDER BY created_at ASC, channel ASC"
            ).fetchall()
        return [self._record_from_row(row) for row in rows]
