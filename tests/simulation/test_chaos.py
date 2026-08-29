from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from contracts.schemas import Dimensions
from simulator.chaos import ChaosInjector


class ChaosInjectorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.start = datetime(2026, 8, 29, 14, 0, tzinfo=timezone.utc)

    def test_random_chaos_hides_dimensions_until_reveal(self) -> None:
        injector = ChaosInjector()
        internal = injector.inject_random(35, self.start, duration_minutes=3)

        public = injector.public_spec(internal.chaos_id)
        self.assertIsNotNone(public)
        self.assertIsNone(public.dimensions)
        self.assertFalse(public.revealed)

        revealed = injector.reveal(internal.chaos_id)
        self.assertIsNotNone(revealed)
        self.assertTrue(revealed.revealed)
        self.assertIsNotNone(revealed.dimensions)
        self.assertLessEqual(len(revealed.dimensions.model_dump(exclude_none=True)), 3)

    def test_keeps_multiple_active_incidents_and_expires_them(self) -> None:
        injector = ChaosInjector()
        first = injector.inject_manual(Dimensions(provider="nova_pay"), 20, self.start, 1)
        second = injector.inject_manual(Dimensions(issuing_bank="itau"), 30, self.start, 3)

        active = injector.active_at(self.start + timedelta(seconds=30))
        self.assertEqual({spec.chaos_id for spec in active}, {first.chaos_id, second.chaos_id})

        active_after_first = injector.active_at(self.start + timedelta(minutes=1, seconds=1))
        self.assertEqual([spec.chaos_id for spec in active_after_first], [second.chaos_id])

    def test_rejects_invalid_manual_chaos(self) -> None:
        injector = ChaosInjector()
        with self.assertRaisesRegex(ValueError, "al menos una dimensión"):
            injector.inject_manual(Dimensions(), 20, self.start)
        with self.assertRaisesRegex(ValueError, "entre 1 y 95"):
            injector.inject_manual(Dimensions(country="BR"), 0, self.start)


if __name__ == "__main__":
    unittest.main()
