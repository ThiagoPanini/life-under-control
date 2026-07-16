"""Occurrence state suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/derive-estado-ocorrencia.ts.
"""

from dataclasses import replace
from datetime import date

from luc_api.finance.application.occurrence_state import (
    Occurrence,
    beacon_of_occurrence,
    long_reading_of_occurrence,
    phrase_of_occurrence,
    sort_by_urgency,
)
from luc_api.finance.domain.bill import Recurrence

_MONTHLY = Recurrence(interval_months=1, anchor_month=None)

_OCCURRENCE_BASE = Occurrence(
    due_date=date(2026, 7, 10),
    reference_period="2026-07",
    recurrence=_MONTHLY,
    settled=False,
)


def _occurrence(**over: object) -> Occurrence:
    return replace(_OCCURRENCE_BASE, **over)  # type: ignore[arg-type]


# --- beacon_of_occurrence (Seam 1) ---


def test_beacon_red_when_overdue_or_due_today():
    today = date(2026, 7, 10)
    assert beacon_of_occurrence(_occurrence(due_date=date(2026, 7, 2)), today) == "vermelho"
    assert beacon_of_occurrence(_occurrence(due_date=date(2026, 7, 10)), today) == "vermelho"


def test_beacon_yellow_at_3_day_threshold():
    today = date(2026, 7, 10)
    assert beacon_of_occurrence(_occurrence(due_date=date(2026, 7, 13)), today) == "amarelo"
    assert beacon_of_occurrence(_occurrence(due_date=date(2026, 7, 14)), today) == "cinza"


def test_beacon_green_when_settled_even_if_overdue():
    occurrence = _occurrence(due_date=date(2026, 7, 2), settled=True)
    assert beacon_of_occurrence(occurrence, date(2026, 7, 10)) == "verde"


# --- phrase_of_occurrence (Seam 1) ---


def test_phrase_by_beacon_and_proximity():
    today = date(2026, 7, 10)
    assert phrase_of_occurrence(_occurrence(due_date=date(2026, 7, 2)), today) == "venceu há 8 dias"
    assert phrase_of_occurrence(_occurrence(due_date=date(2026, 7, 10)), today) == "vence hoje"
    assert phrase_of_occurrence(_occurrence(due_date=date(2026, 7, 12)), today) == "vence em 2 dias"
    assert phrase_of_occurrence(_occurrence(due_date=date(2026, 7, 24)), today) == "em 14 dias"


def test_phrase_singular_for_1_day():
    today = date(2026, 7, 10)
    assert phrase_of_occurrence(_occurrence(due_date=date(2026, 7, 9)), today) == "venceu há 1 dia"
    assert phrase_of_occurrence(_occurrence(due_date=date(2026, 7, 11)), today) == "vence em 1 dia"


def test_settled_phrase_with_reference_period():
    today = date(2026, 7, 10)
    settled = _occurrence(settled=True, reference_period="2026-07")
    assert phrase_of_occurrence(settled, today) == "quitada · Julho/2026"

    yearly = Recurrence(interval_months=12, anchor_month=7)
    settled_yearly = _occurrence(settled=True, reference_period="2026-07", recurrence=yearly)
    assert phrase_of_occurrence(settled_yearly, today) == "quitada · 2026"


# --- long_reading_of_occurrence (Seam 1) ---


def test_long_reading_overdue_with_date():
    occurrence = _occurrence(reference_period="2026-06", due_date=date(2026, 6, 28))
    result = long_reading_of_occurrence(occurrence, date(2026, 7, 1))
    assert result == "competência de junho sem Lançamento — venceu 28/06/2026"


def test_long_reading_due_today():
    occurrence = _occurrence(reference_period="2026-07", due_date=date(2026, 7, 10))
    result = long_reading_of_occurrence(occurrence, date(2026, 7, 10))
    assert result == "competência de julho sem Lançamento — vence hoje"


def test_long_reading_due_in_the_future():
    occurrence = _occurrence(reference_period="2026-07", due_date=date(2026, 7, 20))
    result = long_reading_of_occurrence(occurrence, date(2026, 7, 10))
    assert result == "competência de julho sem Lançamento — vence 20/07/2026"


def test_long_reading_settled_does_not_mention_due_date():
    occurrence = _occurrence(reference_period="2026-06", due_date=date(2026, 6, 28), settled=True)
    result = long_reading_of_occurrence(occurrence, date(2026, 7, 1))
    assert result == "competência de junho quitada"


# --- sort_by_urgency (Seam 1) ---


def test_sort_red_yellow_gray_green_then_proximity():
    # given
    today = date(2026, 7, 10)
    verde = _occurrence(reference_period="verde", settled=True)
    cinza_longe = _occurrence(reference_period="cinza-longe", due_date=date(2026, 7, 30))
    cinza_perto = _occurrence(reference_period="cinza-perto", due_date=date(2026, 7, 20))
    amarelo = _occurrence(reference_period="amarelo", due_date=date(2026, 7, 12))
    vermelho_leve = _occurrence(reference_period="vermelho-leve", due_date=date(2026, 7, 9))
    vermelho_forte = _occurrence(reference_period="vermelho-forte", due_date=date(2026, 6, 20))

    # when
    sorted_occurrences = sort_by_urgency(
        [cinza_longe, verde, amarelo, vermelho_leve, cinza_perto, vermelho_forte], today
    )

    # then
    assert [o.reference_period for o in sorted_occurrences] == [
        "vermelho-forte",
        "vermelho-leve",
        "amarelo",
        "cinza-perto",
        "cinza-longe",
        "verde",
    ]
