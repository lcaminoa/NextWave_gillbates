"""Tests de engine/detection/pipeline.py (el "cablecito" que conecta DetectionEngine ->
mix-shift -> generate_candidates solo, ventana por ventana).

Dos escenarios pedidos explicitamente por el equipo:
1. Dos incidentes simultaneos en segmentos distintos no se mezclan entre si.
2. Con los defaults de produccion (config.py, SIN calibrar a mano como en demo.py), el
   detector confirma un incidente sostenido en pocas ventanas reales -- cierra el riesgo
   abierto que habia quedado documentado en DECISIONS.md D006.
"""
from __future__ import annotations

from datetime import datetime, timedelta
import unittest

from engine.detection import mock_generator
from engine.detection.anomaly import DetectionState, detect
from engine.detection.config import DetectionConfig
from engine.detection.pipeline import DetectionPipeline
from tests.detection.helpers import approval_history, transaction


class TwoSimultaneousIncidentsTests(unittest.TestCase):
    def test_two_segments_falling_at_once_are_diagnosed_independently(self) -> None:
        """provider=nova_pay|country=BR y provider=stripe|country=MX caen a la vez, en la
        misma ventana. Cada uno tiene que aparecer como su propia Anomaly, y el RCA tiene
        que encontrar la causa real de cada uno sin inventar una combinacion cruzada
        (nova_pay+MX o stripe+BR) que nunca existio en los datos."""
        start = datetime(2026, 8, 29, 14, 0, 0)
        history = (
            approval_history(
                start - timedelta(hours=1), total=100, approved=90,
                provider="nova_pay", country="BR", payment_method="card",
                issuing_bank="itau", merchant="VuelaYa",
            )
            + approval_history(
                start - timedelta(hours=1), total=100, approved=90,
                provider="stripe", country="MX", payment_method="wallet",
                issuing_bank="bbva_mx", merchant="Comercio1",
            )
        )
        config = DetectionConfig(min_volume=20, persistence_windows=3)
        pipeline = DetectionPipeline(history=history, config=config)

        results = []
        for minute in range(3):
            window_start = start + timedelta(minutes=minute)
            failing_a = [
                transaction(
                    window_start + timedelta(seconds=index), False,
                    provider="nova_pay", country="BR", payment_method="card",
                    issuing_bank="itau", merchant="VuelaYa",
                )
                for index in range(25)
            ]
            failing_b = [
                transaction(
                    window_start + timedelta(seconds=index + 30), False,
                    provider="stripe", country="MX", payment_method="wallet",
                    issuing_bank="bbva_mx", merchant="Comercio1",
                )
                for index in range(25)
            ]
            for txn in failing_a + failing_b:  # orden cronologico dentro de la ventana
                results.extend(pipeline.ingest(txn))
        last = pipeline.flush()
        if last:
            results.append(last)

        diagnoses_by_key = {d.anomaly.dimension_key: d for r in results for d in r.diagnoses}

        self.assertIn("country=BR|provider=nova_pay", diagnoses_by_key)
        self.assertIn("country=MX|provider=stripe", diagnoses_by_key)

        nova = diagnoses_by_key["country=BR|provider=nova_pay"]
        stripe = diagnoses_by_key["country=MX|provider=stripe"]
        nova_dims = [c.dimensions.model_dump(exclude_none=True) for c in nova.candidates]
        stripe_dims = [c.dimensions.model_dump(exclude_none=True) for c in stripe.candidates]

        self.assertIn({"provider": "nova_pay", "country": "BR"}, nova_dims)
        self.assertIn({"provider": "stripe", "country": "MX"}, stripe_dims)

        # ownership (pedido por Stream C): cada diagnosis recibe SOLO candidatos propios,
        # nunca el del otro incidente concurrente -- ni mezclado ni como entrada aparte
        self.assertTrue(all(d.get("provider") != "stripe" for d in nova_dims))
        self.assertTrue(all(d.get("provider") != "nova_pay" for d in stripe_dims))

        # la evidencia tambien queda recortada a la de los candidatos propios (no toda la
        # evidencia generada en la ventana, solo la citada por los candidatos ya filtrados)
        nova_evidence_ids = {e.evidence_id for e in nova.evidence}
        self.assertTrue(all(eid in nova_evidence_ids for c in nova.candidates for eid in c.evidence_ids))
        stripe_evidence_ids = {e.evidence_id for e in stripe.evidence}
        self.assertTrue(all(eid in stripe_evidence_ids for c in stripe.candidates for eid in c.evidence_ids))


class MixShiftPublicationTests(unittest.TestCase):
    """El gate se prueba contra ventanas reales, no solo contra la formula decompose()."""

    start = datetime(2026, 8, 29, 14, 0, 0)

    def _country_window(
        self,
        window_start: datetime,
        *,
        br_total: int,
        br_approved: int,
        mx_total: int,
        mx_approved: int,
    ) -> list:
        """Crea una ventana ordenada sin derramar transacciones a otro minuto."""
        br = [
            transaction(
                window_start + timedelta(microseconds=index),
                index < br_approved,
                provider="nova_pay",
                country="BR",
                payment_method="card",
                issuing_bank="itau",
                merchant="VuelaYa",
            )
            for index in range(br_total)
        ]
        mx = [
            transaction(
                window_start + timedelta(microseconds=br_total + index),
                index < mx_approved,
                provider="nova_pay",
                country="MX",
                payment_method="card",
                issuing_bank="itau",
                merchant="VuelaYa",
            )
            for index in range(mx_total)
        ]
        return br + mx

    def _run_pipeline(
        self,
        history: list,
        windows: list[list],
        config: DetectionConfig,
    ) -> list:
        pipeline = DetectionPipeline(history=history, config=config)
        results = []
        for window in windows:
            for txn in window:
                results.extend(pipeline.ingest(txn))
        final = pipeline.flush()
        if final is not None:
            results.append(final)
        return results

    def test_pure_country_mix_shift_does_not_publish_an_incident(self) -> None:
        """La conversion global cae 15 pp, pero BR y MX conservan sus propias tasas.

        El detector crudo ve la caida sostenida. El pipeline la reclasifica como composicion
        porque dentro de cada segmento no hay degradacion de performance, y por ende no abre
        RCA ni incidente publicable.
        """
        history = self._country_window(
            self.start - timedelta(days=1),
            br_total=80,
            br_approved=76,
            mx_total=20,
            mx_approved=14,
        )
        windows = [
            self._country_window(
                self.start + timedelta(minutes=minute),
                br_total=20,
                br_approved=19,
                mx_total=80,
                mx_approved=56,
            )
            for minute in range(4)
        ]
        config = DetectionConfig(min_volume=20, persistence_windows=3)

        state = DetectionState()
        raw_anomalies = []
        for minute, window in enumerate(windows):
            window_start = self.start + timedelta(minutes=minute)
            raw_anomalies = detect(
                history,
                window,
                window_start,
                window_start + timedelta(minutes=1),
                state,
                config,
            )
        self.assertIn("global", {anomaly.dimension_key for anomaly in raw_anomalies})

        results = self._run_pipeline(history, windows, config)
        diagnoses = [diagnosis for result in results for diagnosis in result.diagnoses]
        self.assertEqual(diagnoses, [])

    def test_mix_shift_plus_real_performance_drop_still_publishes_the_segment(self) -> None:
        """El cambio de mezcla no puede ocultar una baja real dentro de MX."""
        history = self._country_window(
            self.start - timedelta(days=1),
            br_total=80,
            br_approved=76,
            mx_total=20,
            mx_approved=14,
        )
        windows = [
            self._country_window(
                self.start + timedelta(minutes=minute),
                br_total=20,
                br_approved=19,
                mx_total=80,
                # 40% queda claramente por debajo del intervalo creible de MX. Con 50%
                # y solo 20 observaciones historicas, la prueba podia no ser significativa.
                mx_approved=32,
            )
            for minute in range(3)
        ]
        config = DetectionConfig(min_volume=20, persistence_windows=3)

        results = self._run_pipeline(history, windows, config)
        diagnoses_by_key = {
            diagnosis.anomaly.dimension_key
            for result in results
            for diagnosis in result.diagnoses
        }

        self.assertIn("country=MX", diagnoses_by_key)

    def test_new_mix_category_never_suppresses_an_incident(self) -> None:
        """Sin una tasa historica para una categoria, el gate debe ser conservador.

        AR cambia el mix global, pero no existia en la historia. No se puede concluir que su
        baja aprobacion sea una propiedad normal de composicion: el incidente sigue publicado
        para que RCA lo investigue.
        """
        history = self._country_window(
            self.start - timedelta(days=1),
            br_total=80,
            br_approved=76,
            mx_total=20,
            mx_approved=14,
        )
        windows = []
        for minute in range(3):
            window_start = self.start + timedelta(minutes=minute)
            known_countries = self._country_window(
                window_start,
                br_total=20,
                br_approved=19,
                mx_total=20,
                mx_approved=14,
            )
            new_country = [
                transaction(
                    window_start + timedelta(microseconds=40 + index),
                    False,
                    provider="nova_pay",
                    country="AR",
                    payment_method="card",
                    issuing_bank="itau",
                    merchant="VuelaYa",
                )
                for index in range(60)
            ]
            windows.append(known_countries + new_country)

        results = self._run_pipeline(
            history,
            windows,
            DetectionConfig(min_volume=20, persistence_windows=3),
        )
        diagnoses_by_key = {
            diagnosis.anomaly.dimension_key
            for result in results
            for diagnosis in result.diagnoses
        }

        self.assertIn("global", diagnoses_by_key)

    def test_sparse_baseline_category_never_suppresses_an_incident(self) -> None:
        """Una categoria vista solo unas pocas veces tampoco es baseline suficiente."""
        history = self._country_window(
            self.start - timedelta(days=1),
            br_total=95,
            br_approved=95,
            mx_total=5,
            mx_approved=0,
        )
        windows = [
            self._country_window(
                self.start + timedelta(minutes=minute),
                br_total=20,
                br_approved=20,
                mx_total=80,
                mx_approved=0,
            )
            for minute in range(3)
        ]

        results = self._run_pipeline(
            history,
            windows,
            DetectionConfig(min_volume=20, persistence_windows=3),
        )
        diagnoses_by_key = {
            diagnosis.anomaly.dimension_key
            for result in results
            for diagnosis in result.diagnoses
        }

        self.assertIn("global", diagnoses_by_key)

    def test_suppressed_mix_shift_does_not_lend_persistence_to_later_drop(self) -> None:
        """Tras descartar mezcla pura, una caida nueva vuelve a requerir tres ventanas."""
        history = self._country_window(
            self.start - timedelta(days=1),
            br_total=80,
            br_approved=76,
            mx_total=20,
            mx_approved=14,
        )
        pure_mix_windows = [
            self._country_window(
                self.start + timedelta(minutes=minute),
                br_total=20,
                br_approved=19,
                mx_total=80,
                mx_approved=56,
            )
            # Con este gap global, el EWMA cruza su umbral en la segunda ventana; la cuarta
            # es la primera que el detector llega a publicar y el gate puede suprimir/resetear.
            for minute in range(4)
        ]
        real_drop_windows = [
            self._country_window(
                self.start + timedelta(minutes=minute),
                br_total=20,
                br_approved=19,
                mx_total=80,
                mx_approved=32,
            )
            for minute in range(4, 7)
        ]

        results = self._run_pipeline(
            history,
            pure_mix_windows + real_drop_windows,
            DetectionConfig(min_volume=20, persistence_windows=3),
        )
        diagnoses_by_window = {
            result.window_start: {diagnosis.anomaly.dimension_key for diagnosis in result.diagnoses}
            for result in results
        }

        self.assertEqual(diagnoses_by_window[self.start + timedelta(minutes=4)], set())
        self.assertEqual(diagnoses_by_window[self.start + timedelta(minutes=5)], set())
        self.assertIn(
            "country=MX",
            diagnoses_by_window[self.start + timedelta(minutes=6)],
        )


class ProductionDefaultsLongStreamTests(unittest.TestCase):
    def test_default_config_detects_within_a_handful_of_real_windows(self) -> None:
        """D006 (DECISIONS.md) habia quedado con un riesgo abierto: los defaults de
        config.py (ewma_lambda=0.3, persistence_windows=3) solo se habian probado contra
        la demo sintetica de 2 ventanas gigantes, nunca contra ventanas reales de 60s. Esto
        corre un stream continuo de verdad (via DetectionPipeline, ventana por ventana, SIN
        tocar ningun default) y confirma que el incidente inyectado se detecta rapido igual.
        """
        start = datetime(2026, 8, 29, 14, 0, 0)
        history = mock_generator.generate_stream(
            start - timedelta(hours=1), n=1500, interval_seconds=0.2, seed=10,
        )
        chaos = mock_generator.make_chaos(
            provider="nova_pay", country="BR", severity_pp=35.0, started_at=start, mode="manual",
        )
        # 4 minutos de trafico real a 10 tx/seg = 4 ventanas de 60s completas
        stream = mock_generator.generate_stream(start, n=2400, interval_seconds=0.1, chaos=chaos, seed=11)

        pipeline = DetectionPipeline(history=history)  # config.py tal cual, sin calibrar

        results = []
        for txn in stream:
            results.extend(pipeline.ingest(txn))
        last = pipeline.flush()
        if last:
            results.append(last)

        confirmed_at = [
            window_number
            for window_number, r in enumerate(results, start=1)
            if any(d.anomaly.dimension_key == "country=BR|provider=nova_pay" for d in r.diagnoses)
        ]

        self.assertTrue(confirmed_at, "con los defaults de produccion nunca se confirmo el incidente inyectado")
        self.assertLessEqual(
            confirmed_at[0], 4,
            "tardo mas de 4 ventanas reales (4 minutos) en confirmar un incidente sostenido de -35pp",
        )


if __name__ == "__main__":
    unittest.main()


class ChaosRecoveryTests(unittest.TestCase):
    def test_detector_stops_alerting_once_injected_chaos_expires(self) -> None:
        """Cierra el ultimo pendiente de TODO.md seccion 2: cuando un ChaosSpec tiene
        duration_minutes y se vence, el trafico vuelve a la normalidad -- el detector
        tiene que dejar de reportar la anomalia SOLO, sin que nadie reinicie nada."""
        from datetime import timezone as _timezone
        from contracts.schemas import Dimensions
        from simulator import PaymentSimulator

        start = datetime(2026, 8, 29, 14, 0, tzinfo=_timezone.utc)
        history = PaymentSimulator(seed=100).generate(
            start - timedelta(hours=1), count=1500, interval_seconds=0.2,
        )

        live = PaymentSimulator(seed=200)
        live.chaos.inject_manual(
            Dimensions(provider="nova_pay", country="BR"),
            severity_pp=35, started_at=start, duration_minutes=3,
        )
        # 6 minutos = 6 ventanas reales: los primeros 3 con chaos activo, los ultimos 3 sanos
        stream = live.generate(start, count=3600, interval_seconds=0.1)

        pipeline = DetectionPipeline(history=history)
        results = []
        for txn in stream:
            results.extend(pipeline.ingest(txn))
        last = pipeline.flush()
        if last:
            results.append(last)

        self.assertEqual(len(results), 6)
        flagged_windows = [
            index for index, r in enumerate(results, start=1)
            if any(d.anomaly.dimension_key == "country=BR|provider=nova_pay" for d in r.diagnoses)
        ]
        self.assertTrue(flagged_windows, "el incidente inyectado nunca se confirmo")

        # ninguna de las ultimas 2 ventanas (bien despues de que vencio el chaos) puede
        # seguir reportando la anomalia -- si sigue ahi, el detector no se esta recuperando
        recovered_windows = {5, 6}
        self.assertFalse(
            recovered_windows & set(flagged_windows),
            f"el detector siguio alertando en ventanas {sorted(recovered_windows & set(flagged_windows))} "
            "mucho despues de que el chaos vencio -- no se esta recuperando solo",
        )
