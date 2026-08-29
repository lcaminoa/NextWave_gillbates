from __future__ import annotations

import itertools
from datetime import datetime, timedelta

from contracts.schemas import Transaction


_counter = itertools.count()


def transaction(
    timestamp: datetime,
    approved: bool,
    *,
    provider: str = "nova_pay",
    country: str = "BR",
    payment_method: str = "card",
    issuing_bank: str = "itau",
    merchant: str = "VuelaYa",
    amount: float = 100.0,
) -> Transaction:
    """Crea una transaccion determinista y minima para tests."""
    return Transaction(
        transaction_id=f"test_txn_{next(_counter)}",
        timestamp=timestamp,
        merchant=merchant,
        provider=provider,
        payment_method=payment_method,
        country=country,
        issuing_bank=issuing_bank,
        approved=approved,
        amount=amount,
        currency="USD",
        canonical_decline_code=None if approved else "do_not_honor",
        latency_ms=200,
    )


def approval_history(
    start: datetime,
    *,
    total: int = 100,
    approved: int = 90,
    **dimensions: str,
) -> list[Transaction]:
    """Historia con una tasa conocida, distribuida a lo largo de segundos consecutivos."""
    return [
        transaction(start + timedelta(seconds=index), index < approved, **dimensions)
        for index in range(total)
    ]
