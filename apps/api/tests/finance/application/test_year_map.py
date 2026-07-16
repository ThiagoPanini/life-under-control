"""Year map suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/derive-mapa-ano.ts.
"""

from dataclasses import replace
from datetime import date

from luc_api.finance.application.bill_card import is_recurrence_occurrence
from luc_api.finance.application.calendar import FakeCalendar
from luc_api.finance.application.year_map import (
    YEAR_MAP_WINDOW_MONTHS,
    MapCell,
    YearMap,
    classify_value,
    derive_year_map,
)
from luc_api.finance.domain.bill import Bill, FixedDayRule, Recurrence
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import FixedClock

CALENDAR = FakeCalendar()

_BILL_BASE = Bill(
    id="bill-1",
    household_id="h-1",
    name="Internet",
    description=None,
    icon="wifi",
    recurrence=Recurrence(interval_months=1, anchor_month=None),
    due_rule=FixedDayRule(day=10),
    due_month_offset=0,
    first_reference_period="2025-07",
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


def rows_of(year_map: YearMap) -> YearMap:
    """Unwraps the rows, failing the test if the map came back empty."""
    if year_map.state != "com-contas":
        raise AssertionError(f"expected com-contas, got {year_map.state}")
    return year_map


def cell_of(year_map: YearMap, reference_period: str, row: int = 0) -> MapCell:
    """The cell of the requested reference period in the (first) row of the map."""
    for c in rows_of(year_map).rows[row].cells:
        if c.reference_period == reference_period:
            return c
    raise AssertionError(f"cell {reference_period} missing")


WINDOW = [
    "2025-07",
    "2025-08",
    "2025-09",
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
]


# --- derive_year_map (Seam 1) ---


def test_window_of_twelve_reference_periods_up_to_the_current_one():
    year_map = derive_year_map(FixedClock(date(2026, 6, 15)), CALENDAR, [bill()], [payment()])

    assert rows_of(year_map).reference_periods == WINDOW
    assert YEAR_MAP_WINDOW_MONTHS == 12


def test_months_before_the_first_reference_period_are_fora_vigencia():
    # Effective period starts in 2026-01: months before that are outside effect, never "unpaid".
    year_map = derive_year_map(
        FixedClock(date(2026, 6, 15)), CALENDAR, [bill(first_reference_period="2026-01")], []
    )

    assert cell_of(year_map, "2025-07").state == "fora-vigencia"
    assert cell_of(year_map, "2025-12").state == "fora-vigencia"
    # 2026-01 is already effective (a fact-less monthly occurrence) — not fora-vigencia.
    assert cell_of(year_map, "2026-01").state != "fora-vigencia"


def test_month_after_closing_is_fora_vigencia():
    # Closed on 2026-03-20 -> effective period ends 2026-03; April onward is outside effect.
    year_map = derive_year_map(
        FixedClock(date(2026, 6, 15)),
        CALENDAR,
        [bill(state="encerrada", closed_on=date(2026, 3, 20))],
        [],
    )

    assert cell_of(year_map, "2026-03").state != "fora-vigencia"
    assert cell_of(year_map, "2026-04").state == "fora-vigencia"
    assert cell_of(year_map, "2026-06").state == "fora-vigencia"


def test_closed_bill_appears_when_its_effective_period_intersects_the_window():
    # A closed Bill whose effective period touches the window appears; another
    # closed before the window (end < start) does not.
    intersecting = bill(id="b-intersecting", state="encerrada", closed_on=date(2025, 9, 30))
    before = bill(
        id="b-before",
        first_reference_period="2024-01",
        state="encerrada",
        closed_on=date(2025, 5, 31),
    )
    year_map = derive_year_map(FixedClock(date(2026, 6, 15)), CALENDAR, [intersecting, before], [])

    ids = [row.bill_id for row in rows_of(year_map).rows]
    assert "b-intersecting" in ids
    assert "b-before" not in ids


def test_inside_effect_outside_recurrence_is_sem_ocorrencia():
    # Bimonthly anchored in June (an even month) without facts: odd months in
    # effect are sem-ocorrencia; an even month is an occurrence (por-vir/vencida).
    bimonthly = bill(
        recurrence=Recurrence(interval_months=2, anchor_month=6), first_reference_period="2025-07"
    )
    year_map = derive_year_map(FixedClock(date(2026, 6, 15)), CALENDAR, [bimonthly], [])

    assert cell_of(year_map, "2025-09").state == "sem-ocorrencia"  # odd -> outside recurrence
    assert cell_of(year_map, "2026-01").state == "sem-ocorrencia"
    assert cell_of(year_map, "2025-08").state in ("por-vir", "vencida")  # even -> occurrence


def test_split_sums_and_classifies_na_media_acima_and_abaixo():
    # Facts: 80 / 100 (split 60+40) / 100 / 100 / 120 -> average 100.00; tolerance +/-5%.
    payments = [
        payment(id="p-fev", reference_period="2026-02", amount_cents=8000),
        payment(id="p-mar-a", reference_period="2026-03", amount_cents=6000),
        payment(id="p-mar-b", reference_period="2026-03", amount_cents=4000),
        payment(id="p-abr", reference_period="2026-04", amount_cents=10000),
        payment(id="p-mai", reference_period="2026-05", amount_cents=10000),
        payment(id="p-jun", reference_period="2026-06", amount_cents=12000),
    ]
    year_map = derive_year_map(FixedClock(date(2026, 6, 15)), CALENDAR, [bill()], payments)

    assert rows_of(year_map).rows[0].average_cents == 10000
    # split summed and within tolerance
    assert cell_of(year_map, "2026-03") == MapCell(
        reference_period="2026-03", state="na-media", amount_cents=10000, deviation_cents=0
    )
    assert cell_of(year_map, "2026-06") == MapCell(
        reference_period="2026-06", state="acima", amount_cents=12000, deviation_cents=2000
    )
    assert cell_of(year_map, "2026-02") == MapCell(
        reference_period="2026-02", state="abaixo", amount_cents=8000, deviation_cents=-2000
    )


def test_average_ignores_gap_never_zeroed():
    # Only two months with a fact; the average is 100.00 (average of the facts),
    # not diluted by gaps turning into zero.
    payments = [
        payment(id="p-mai", reference_period="2026-05", amount_cents=10000),
        payment(id="p-jun", reference_period="2026-06", amount_cents=10000),
    ]
    year_map = derive_year_map(FixedClock(date(2026, 6, 15)), CALENDAR, [bill()], payments)

    assert rows_of(year_map).rows[0].average_cents == 10000


def test_future_occurrence_without_a_fact_is_por_vir():
    # Due on day 20; today is day 15 -> still upcoming.
    year_map = derive_year_map(
        FixedClock(date(2026, 6, 15)), CALENDAR, [bill(due_rule=FixedDayRule(day=20))], []
    )

    assert cell_of(year_map, "2026-06").state == "por-vir"


def test_overdue_occurrence_without_a_fact_is_vencida():
    # May came due (day 10) and has no fact -> overdue.
    year_map = derive_year_map(FixedClock(date(2026, 6, 15)), CALENDAR, [bill()], [])

    assert cell_of(year_map, "2026-05").state == "vencida"


def test_without_average_has_an_explicit_representation():
    # Bill with no fact at all in the window: average None (explicit absence), no
    # cell classified as acima/abaixo/na-media.
    year_map = derive_year_map(FixedClock(date(2026, 6, 15)), CALENDAR, [bill()], [])

    assert rows_of(year_map).rows[0].average_cents is None
    states = [c.state for c in rows_of(year_map).rows[0].cells]
    assert "acima" not in states
    assert "abaixo" not in states
    assert "na-media" not in states


def test_sem_contas_when_no_effective_period_intersects():
    # The whole effective period is in the window's future -> no row -> sem-contas.
    year_map = derive_year_map(
        FixedClock(date(2026, 6, 15)), CALENDAR, [bill(first_reference_period="2027-01")], []
    )

    assert year_map.state == "sem-contas"


def test_fact_outside_effect_does_not_pollute_the_average():
    # Effective period starts 2026-04; a retroactive Payment in 2026-02 (in the
    # window, but before the start) is hidden as fora-vigencia — and must NOT
    # enter the average.
    payments = [
        payment(id="p-retro", reference_period="2026-02", amount_cents=99999),
        payment(id="p-mai", reference_period="2026-05", amount_cents=10000),
        payment(id="p-jun", reference_period="2026-06", amount_cents=10000),
    ]
    year_map = derive_year_map(
        FixedClock(date(2026, 6, 15)), CALENDAR, [bill(first_reference_period="2026-04")], payments
    )

    # average only of facts inside the effective period (10000), not diluted by the retroactive one.
    assert rows_of(year_map).rows[0].average_cents == 10000
    # the retroactive cell is fora-vigencia, with a hidden amount (not "unpaid").
    assert cell_of(year_map, "2026-02").state == "fora-vigencia"
    assert cell_of(year_map, "2026-02").amount_cents is None


def test_occurrence_due_today_without_a_fact_is_vencida():
    # Due on day 10 and today is day 10 -> already overdue (>=), like the card's beacon/grid.
    year_map = derive_year_map(FixedClock(date(2026, 6, 10)), CALENDAR, [bill()], [])

    assert cell_of(year_map, "2026-06").state == "vencida"


# --- classify_value (Seam 1) ---


def test_within_5pct_is_na_media_at_both_extremes():
    assert classify_value(10500, 10000) == "na-media"  # +5% exact
    assert classify_value(9500, 10000) == "na-media"  # -5% exact


def test_above_5pct_is_acima():
    assert classify_value(10501, 10000) == "acima"


def test_below_5pct_is_abaixo():
    assert classify_value(9499, 10000) == "abaixo"


# --- is_recurrence_occurrence (Seam 1) ---


def test_monthly_every_reference_period_is_an_occurrence():
    assert (
        is_recurrence_occurrence(Recurrence(interval_months=1, anchor_month=None), "2026-03")
        is True
    )


def test_bimonthly_respects_the_anchor():
    bimonthly = Recurrence(interval_months=2, anchor_month=6)  # June and even months
    assert is_recurrence_occurrence(bimonthly, "2026-06") is True
    assert is_recurrence_occurrence(bimonthly, "2026-08") is True
    assert is_recurrence_occurrence(bimonthly, "2026-07") is False


def test_yearly_only_the_anchors_reference_period():
    yearly = Recurrence(interval_months=12, anchor_month=1)
    assert is_recurrence_occurrence(yearly, "2026-01") is True
    assert is_recurrence_occurrence(yearly, "2026-02") is False
