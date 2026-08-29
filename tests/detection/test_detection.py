from __future__ import annotations

from datetime import datetime, timedelta
import unittest

from engine.detection.anomaly import DetectionState, detect
from engine.detection.config import DetectionConfig
from engine.detection.mix_shift import decompose
from tests.detection.helpers import approval_history, transaction


class DetectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.start = datetime(2026, 8, 29, 14, 0, 0)
        self.history = approval_history(self.start - timedelta(hours=1))
        self.config = DetectionConfig(min_volume=20, persistence_windows=3)

    def test_normal_traffic_does_not_alert(self) -> None:
        window = [
            transaction(self.start + timedelta(seconds=index), index < 18)
            for index in range(20)
        ]

        anomalies = detect(
            self.history, window, self.start, self.start + timedelta(minutes=1),
            DetectionState(), self.config,
        )

        self.assertEqual(anomalies, [])

    def test_sustained_conversion_drop_alerts_on_the_third_window(self) -> None:
        state = DetectionState()
        for minute in range(3):
            window_start = self.start + timedelta(minutes=minute)
            failed_window = [
                transaction(window_start + timedelta(seconds=index), False)
                for index in range(20)
            ]
            anomalies = detect(
                self.history,
                failed_window,
                window_start,
                window_start + timedelta(minutes=1),
                state,
                self.config,
            )
            if minute < 2:
                self.assertEqual(anomalies, [])

        global_anomaly = next(anomaly for anomaly in anomalies if anomaly.dimension_key == "global")
        self.assertEqual(global_anomaly.persistence_windows, 3)
        self.assertLess(global_anomaly.observed_approval_rate, global_anomaly.expected_approval_rate)

    def test_low_volume_drop_does_not_alert(self) -> None:
        state = DetectionState()
        for minute in range(3):
            window_start = self.start + timedelta(minutes=minute)
            window = [transaction(window_start + timedelta(seconds=index), False) for index in range(19)]
            anomalies = detect(
                self.history,
                window,
                window_start,
                window_start + timedelta(minutes=1),
                state,
                self.config,
            )

        self.assertEqual(anomalies, [])

    def test_provider_country_incident_is_detected_as_its_own_segment(self) -> None:
        """Evita diluir un incidente provider × country entre metodos de pago."""
        history = approval_history(
            self.start - timedelta(hours=1),
            total=100,
            approved=90,
            provider="nova_pay",
            country="BR",
        )
        state = DetectionState()

        for minute in range(3):
            window_start = self.start + timedelta(minutes=minute)
            failed_window = [
                transaction(
                    window_start + timedelta(seconds=index),
                    False,
                    provider="nova_pay",
                    country="BR",
                )
                for index in range(40)
            ]
            anomalies = detect(
                history,
                failed_window,
                window_start,
                window_start + timedelta(minutes=1),
                state,
                self.config,
            )

        provider_country = next(
            anomaly
            for anomaly in anomalies
            if anomaly.dimension_key == "country=BR|provider=nova_pay"
        )
        self.assertEqual(provider_country.persistence_windows, 3)
        self.assertEqual(provider_country.volume, 40)

    def test_pure_mix_shift_has_no_performance_effect(self) -> None:
        baseline = (
            approval_history(self.start - timedelta(hours=2), total=80, approved=76, country="BR")
            + approval_history(self.start - timedelta(hours=1), total=20, approved=14, country="MX")
        )
        current = (
            approval_history(self.start, total=20, approved=19, country="BR")
            + approval_history(self.start + timedelta(minutes=1), total=80, approved=56, country="MX")
        )

        mix_effect_pp, performance_effect_pp = decompose(baseline, current, dimension="country")

        self.assertAlmostEqual(mix_effect_pp, -15.0, places=2)
        self.assertAlmostEqual(performance_effect_pp, 0.0, places=2)
