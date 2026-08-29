from __future__ import annotations

import unittest

from engine.detection.config import DetectionConfig


class DetectionConfigTests(unittest.TestCase):
    def test_defaults_are_the_productive_detection_policy(self) -> None:
        config = DetectionConfig()

        self.assertEqual(config.window_seconds, 60)
        self.assertEqual(config.min_volume, 20)
        self.assertEqual(config.persistence_windows, 3)
        self.assertEqual(config.credible_interval, 0.95)
        self.assertEqual(config.ewma_lambda, 0.3)
        self.assertEqual(config.ewma_threshold, -0.05)

    def test_rejects_invalid_statistical_parameters(self) -> None:
        with self.assertRaises(ValueError):
            DetectionConfig(credible_interval=1.0)
        with self.assertRaises(ValueError):
            DetectionConfig(ewma_lambda=0)
        with self.assertRaises(ValueError):
            DetectionConfig(persistence_windows=0)
