from __future__ import annotations

import unittest
from datetime import datetime, timezone

from contracts.schemas import Dimensions
from simulator import PaymentSimulator
from simulator.catalog import ISSUING_BANKS_BY_COUNTRY, PAYMENT_METHODS_BY_COUNTRY


class PaymentSimulatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.start = datetime(2026, 8, 29, 14, 0, tzinfo=timezone.utc)

    def test_generates_contract_valid_transactions(self) -> None:
        transactions = PaymentSimulator(seed=7).generate(self.start, count=100, interval_seconds=1)

        self.assertEqual(len(transactions), 100)
        self.assertEqual(len({transaction.transaction_id for transaction in transactions}), 100)
        for transaction in transactions:
            self.assertIn(transaction.payment_method, PAYMENT_METHODS_BY_COUNTRY[transaction.country])
            self.assertIn(transaction.issuing_bank, ISSUING_BANKS_BY_COUNTRY[transaction.country])
            if transaction.approved:
                self.assertIsNone(transaction.canonical_decline_code)
            else:
                self.assertIsNotNone(transaction.canonical_decline_code)
                self.assertIsNotNone(transaction.raw_provider_code)

    def test_targeted_chaos_lowers_only_affected_segment(self) -> None:
        simulator = PaymentSimulator(seed=13)
        simulator.chaos.inject_manual(
            Dimensions(provider="nova_pay", country="BR"),
            severity_pp=-45,
            started_at=self.start,
        )
        transactions = simulator.generate(self.start, count=30_000, interval_seconds=0.01)
        affected = [
            transaction for transaction in transactions
            if transaction.provider == "nova_pay" and transaction.country == "BR"
        ]
        control = [
            transaction for transaction in transactions
            if transaction.provider == "atlas_pay" and transaction.country == "BR"
        ]
        affected_rate = sum(transaction.approved for transaction in affected) / len(affected)
        control_rate = sum(transaction.approved for transaction in control) / len(control)

        self.assertGreater(len(affected), 1_000)
        self.assertGreater(len(control), 1_000)
        self.assertLess(affected_rate, control_rate - 0.30)

    def test_infinite_stream_can_be_consumed_incrementally(self) -> None:
        simulator = PaymentSimulator(seed=1)
        stream = simulator.stream(self.start, interval_seconds=2)
        first = next(stream)
        second = next(stream)

        self.assertEqual((second.timestamp - first.timestamp).total_seconds(), 2)


if __name__ == "__main__":
    unittest.main()
