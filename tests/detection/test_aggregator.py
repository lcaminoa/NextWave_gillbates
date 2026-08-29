from __future__ import annotations

from datetime import datetime, timedelta
import unittest

from engine.detection.aggregator import WindowAggregator
from tests.detection.helpers import transaction


class WindowAggregatorTests(unittest.TestCase):
    def test_closes_a_window_and_emits_global_and_segment_stats(self) -> None:
        start = datetime(2026, 8, 29, 14, 0, 0)
        aggregator = WindowAggregator()

        self.assertEqual(aggregator.ingest(transaction(start + timedelta(seconds=10), True)), [])
        self.assertEqual(aggregator.ingest(transaction(start + timedelta(seconds=40), False)), [])
        closed = aggregator.ingest(transaction(start + timedelta(minutes=1), True))

        self.assertEqual(len(closed), 1)
        batch = closed[0]
        self.assertEqual(batch.window_start, start)
        self.assertEqual(batch.window_end, start + timedelta(minutes=1))
        self.assertEqual(len(batch.transactions), 2)

        global_stats = next(stat for stat in batch.stats if stat.dimensions == {})
        self.assertEqual(global_stats.attempts, 2)
        self.assertEqual(global_stats.approvals, 1)
        self.assertEqual(global_stats.observed_approval_rate, 0.5)

        provider_stats = next(
            stat for stat in batch.stats if stat.dimensions == {"provider": "nova_pay"}
        )
        self.assertEqual(provider_stats.attempts, 2)

    def test_rejects_late_events(self) -> None:
        start = datetime(2026, 8, 29, 14, 0, 0)
        aggregator = WindowAggregator()
        aggregator.ingest(transaction(start + timedelta(minutes=1), True))

        with self.assertRaises(ValueError):
            aggregator.ingest(transaction(start + timedelta(seconds=30), True))
