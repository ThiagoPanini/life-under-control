"""Send due digest suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/enviar-digest-vencimentos.test.ts.
"""

from dataclasses import dataclass, replace
from datetime import date

from luc_api.finance.application.bill_repo import BillDependents, BillRepo, NewBill
from luc_api.finance.application.calendar import FakeCalendar
from luc_api.finance.application.digest_send_log import FakeDigestSendLog
from luc_api.finance.application.notifier import FakeNotifier, Template
from luc_api.finance.application.payment_repo import FakePaymentRepo
from luc_api.finance.application.send_due_digest import (
    DIGEST_LANGUAGE,
    DIGEST_TEMPLATE,
    DigestDeps,
    send_due_digest,
)
from luc_api.finance.domain.bill import Bill, BillData, FixedDayRule, Recurrence
from luc_api.finance.domain.payment import Payment
from luc_api.identity.application.household_repo import HouseholdRepo
from luc_api.identity.domain.household import Household, User
from luc_api.shared.application.clock import FixedClock


class _FakeBillRepo(BillRepo):
    """Read-only BillRepo double: `list_bills` only, matching this suite's actual need."""

    def __init__(self, bills: list[Bill]) -> None:
        self._bills = bills

    async def list_bills(self, household_id: str) -> list[Bill]:
        return [bill for bill in self._bills if bill.household_id == household_id]

    async def create_bill(self, new_bill: NewBill) -> Bill:
        raise NotImplementedError("not used")

    async def get_bill(self, household_id: str, bill_id: str) -> Bill | None:
        raise NotImplementedError("not used")

    async def edit_bill(self, household_id: str, bill_id: str, data: BillData) -> Bill | None:
        raise NotImplementedError("not used")

    async def close_bill(self, household_id: str, bill_id: str, closed_on: date) -> Bill | None:
        raise NotImplementedError("not used")

    async def reactivate_bill(self, household_id: str, bill_id: str) -> Bill | None:
        raise NotImplementedError("not used")

    async def count_dependents(self, household_id: str, bill_id: str) -> BillDependents:
        raise NotImplementedError("not used")

    async def delete_bill(self, household_id: str, bill_id: str) -> BillDependents | None:
        raise NotImplementedError("not used")

    async def set_logo(self, household_id: str, bill_id: str, logo_key: str | None) -> Bill | None:
        raise NotImplementedError("not used")


class _FakeHouseholdRepo(HouseholdRepo):
    """HouseholdRepo double yielding the seeded Household (or `None`)."""

    def __init__(self, household: Household | None) -> None:
        self._household = household

    async def load_household(self) -> Household | None:
        return self._household


_BILL_BASE = Bill(
    id="bill-1",
    household_id="h-1",
    name="Luz",
    description=None,
    icon="zap",
    recurrence=Recurrence(interval_months=1, anchor_month=None),
    due_rule=FixedDayRule(day=10),
    due_month_offset=0,
    first_reference_period="2020-01",
    state="ativa",
    closed_on=None,
    logo_key=None,
)


def bill(**over: object) -> Bill:
    return replace(_BILL_BASE, **over)  # type: ignore[arg-type]


_PAYMENT_BASE = Payment(
    id="pay-1",
    household_id="h-1",
    bill_id="bill-1",
    amount_cents=10000,
    paid_on=date(2026, 6, 8),
    reference_period="2026-06",
    paid_by="p-1",
)


def payment(**over: object) -> Payment:
    return replace(_PAYMENT_BASE, **over)  # type: ignore[arg-type]


def _history(bill_id: str, may_cents: int, april_cents: int) -> list[Payment]:
    """Two reference periods of history (avg 11000) for `bill_id`."""
    return [
        payment(
            id=f"{bill_id}-may", bill_id=bill_id, reference_period="2026-05", amount_cents=may_cents
        ),
        payment(
            id=f"{bill_id}-apr",
            bill_id=bill_id,
            reference_period="2026-04",
            amount_cents=april_cents,
        ),
    ]


def _user(user_id: str, name: str, whatsapp_phone: str | None = None) -> User:
    return User(
        id=user_id,
        name=name,
        email=f"{name.lower()}@casapanini.lar",
        google_email=None,
        hue=211,
        initial=name[0],
        avatar_key=None,
        whatsapp_phone=whatsapp_phone,
    )


_COUPLE = Household(
    id="h-1",
    name="Casa Panini",
    users=(
        _user("u-1", "Thiago", "+5511900000001"),
        _user("u-2", "Jakeline", "+5511900000002"),
    ),
)


def _bills_with_overdue() -> tuple[list[Bill], list[Payment]]:
    """An overdue one (Luz ~ R$ 110) + a due-soon one (Água ~ R$ 50), total ~ R$ 160."""
    bills = [
        bill(id="luz", name="Luz", due_rule=FixedDayRule(day=2)),
        bill(id="agua", name="Água", due_rule=FixedDayRule(day=12)),
    ]
    payments = [*_history("luz", 10000, 12000), *_history("agua", 5000, 5000)]
    return bills, payments


@dataclass
class _Deps:
    deps: DigestDeps
    notifier: FakeNotifier
    send_log: FakeDigestSendLog


def _deps(
    household: Household | None,
    bills: list[Bill],
    payments: list[Payment],
    send_log: FakeDigestSendLog | None = None,
    notifier: FakeNotifier | None = None,
) -> _Deps:
    resolved_notifier = notifier or FakeNotifier()
    resolved_send_log = send_log or FakeDigestSendLog()
    deps = DigestDeps(
        household_repo=_FakeHouseholdRepo(household),
        bill_repo=_FakeBillRepo(bills),
        payment_repo=FakePaymentRepo(payments),
        send_log=resolved_send_log,
        notifier=resolved_notifier,
        clock=FixedClock(date(2026, 7, 10)),
        calendar=FakeCalendar(),
    )
    return _Deps(deps=deps, notifier=resolved_notifier, send_log=resolved_send_log)


# --- send_due_digest (Seam 1) ---


async def test_both_users_receive_the_same_template():
    bills, payments = _bills_with_overdue()
    d = _deps(_COUPLE, bills, payments)

    result = await send_due_digest(d.deps)

    assert result.status == "enviado"
    assert result.sent == 2
    assert result.already_sent == 0
    assert result.failed == 0
    assert result.without_phone == 0
    assert d.notifier.sent == [
        (
            "+5511900000001",
            Template(
                name=DIGEST_TEMPLATE,
                language=DIGEST_LANGUAGE,
                params=("Luz ≈ R$ 110", "Água ≈ R$ 50", "≈ R$ 160"),
            ),
        ),
        (
            "+5511900000002",
            Template(
                name=DIGEST_TEMPLATE,
                language=DIGEST_LANGUAGE,
                params=("Luz ≈ R$ 110", "Água ≈ R$ 50", "≈ R$ 160"),
            ),
        ),
    ]


async def test_nothing_pending_sends_nothing():
    # Bill settled in July -> green beacon -> outside the strip -> digest doesn't go out
    bills = [bill(id="luz")]
    payments = [payment(id="luz-jul", bill_id="luz", reference_period="2026-07")]
    d = _deps(_COUPLE, bills, payments)

    result = await send_due_digest(d.deps)

    assert result.status == "nada-a-enviar"
    assert d.notifier.sent == []


async def test_duplicate_run_same_day_does_not_resend():
    bills, payments = _bills_with_overdue()
    send_log = FakeDigestSendLog()
    d = _deps(_COUPLE, bills, payments, send_log=send_log)

    await send_due_digest(d.deps)
    second = await send_due_digest(d.deps)

    assert second.status == "enviado"
    assert second.sent == 0
    assert second.already_sent == 2
    assert second.failed == 0
    assert second.without_phone == 0
    # only the first run's 2 sends
    assert len(d.notifier.sent) == 2


async def test_refused_send_releases_claim_and_allows_retry():
    bills, payments = _bills_with_overdue()
    send_log = FakeDigestSendLog()
    refusing_notifier = FakeNotifier(accepts=False)
    d = _deps(_COUPLE, bills, payments, send_log=send_log, notifier=refusing_notifier)

    failed_result = await send_due_digest(d.deps)
    assert failed_result.status == "enviado"
    assert failed_result.sent == 0
    assert failed_result.already_sent == 0
    assert failed_result.failed == 2
    assert failed_result.without_phone == 0

    # the claim was released, so the next run resends -- the day is not poisoned
    accepting_deps = replace(d.deps, notifier=FakeNotifier())
    retry = await send_due_digest(accepting_deps)
    assert retry.status == "enviado"
    assert retry.sent == 2
    assert retry.already_sent == 0
    assert retry.failed == 0
    assert len(accepting_deps.notifier.sent) == 2  # type: ignore[union-attr]


async def test_without_household_sends_nothing():
    d = _deps(None, [], [])

    result = await send_due_digest(d.deps)

    assert result.status == "sem-lar"
    assert d.notifier.sent == []


async def test_user_without_phone_is_skipped():
    bills, payments = _bills_with_overdue()
    half_linked = Household(
        id="h-1",
        name="Casa Panini",
        users=(_user("u-1", "Thiago", "+5511900000001"), _user("u-2", "Jakeline", None)),
    )
    d = _deps(half_linked, bills, payments)

    result = await send_due_digest(d.deps)

    assert result.status == "enviado"
    assert result.sent == 1
    assert result.already_sent == 0
    assert result.failed == 0
    assert result.without_phone == 1
    assert len(d.notifier.sent) == 1
    assert d.notifier.sent[0][0] == "+5511900000001"
