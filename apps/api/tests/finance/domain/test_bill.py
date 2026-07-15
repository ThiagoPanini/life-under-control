"""Bill (Conta) registration rule: suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/domain/bill.test.ts. Describe blocks for
`ehCompetenciaValida`/`ehDataIsoValida`/`formatarDataBr`/`mesCurto`/
`diaDaSemanaAbreviado` are kernel-owned (`shared.domain.civil_date`, already
covered there); pt-BR display helpers (`descreverRecorrencia` etc.) are
read-side copy and stay out of the facts slice (#188).
"""

from dataclasses import fields, replace

from luc_api.finance.domain.bill import (
    BillData,
    BillRaw,
    FixedDayRule,
    LastBusinessDayRule,
    NthBusinessDayRule,
    Recurrence,
    validate_bill_data,
)

# Minimal valid registration (monthly, fixed day) — each test mutates what matters.
_VALID_RAW = BillRaw(
    name="Condomínio",
    description=None,
    icon="home",
    interval_months=1,
    anchor_month=None,
    due_rule_kind="dia-fixo",
    due_rule_day=10,
    due_rule_nth=None,
    due_month_offset=0,
    first_reference_period="2026-01",
)


def valid_raw(**over: object) -> BillRaw:
    return replace(_VALID_RAW, **over)  # type: ignore[arg-type]


# --- validarDadosBill (Seam 1) ---


def test_monthly_fixed_day_registration_normalizes_and_passes():
    res = validate_bill_data(valid_raw(name="  Condomínio  ", description="  "))

    assert res.ok is True
    assert res.value == BillData(
        name="Condomínio",
        description=None,
        icon="home",
        recurrence=Recurrence(interval_months=1, anchor_month=None),
        due_rule=FixedDayRule(day=10),
        due_month_offset=0,
        first_reference_period="2026-01",
    )


def test_valid_first_reference_period_normalizes_and_passes():
    res = validate_bill_data(valid_raw(first_reference_period="  2025-03  "))

    assert res.ok is True
    assert res.value.first_reference_period == "2025-03"


def test_missing_first_reference_period_fails():
    # Vigência starts at the first reference period (invariant #5): without it
    # there is nothing to project from. Absence is an error, never a default.
    res = validate_bill_data(valid_raw(first_reference_period=None))

    assert res.ok is False
    assert "primeiraCompetencia" in [e.field for e in res.errors]


def test_malformed_first_reference_period_fails():
    # Must be canonical year-month (YYYY-MM); "03/2025" or month outside 1-12 fail.
    assert not validate_bill_data(valid_raw(first_reference_period="03/2025")).ok
    assert not validate_bill_data(valid_raw(first_reference_period="2025-13")).ok
    res = validate_bill_data(valid_raw(first_reference_period="2025-00"))
    assert res.ok is False
    assert "primeiraCompetencia" in [e.field for e in res.errors]


def test_monthly_ignores_given_anchor():
    res = validate_bill_data(valid_raw(interval_months=1, anchor_month=5))

    assert res.ok is True
    assert res.value.recurrence.anchor_month is None


def test_interval_above_one_requires_anchor():
    res = validate_bill_data(valid_raw(interval_months=2, anchor_month=None))

    assert res.ok is False
    assert "anchorMonth" in [e.field for e in res.errors]


def test_yearly_with_anchor_passes():
    res = validate_bill_data(valid_raw(interval_months=12, anchor_month=1))

    assert res.ok is True
    assert res.value.recurrence == Recurrence(interval_months=12, anchor_month=1)


def test_blank_name_fails():
    res = validate_bill_data(valid_raw(name="   "))

    assert res.ok is False
    assert "nome" in [e.field for e in res.errors]


def test_icon_outside_catalog_fails():
    res = validate_bill_data(valid_raw(icon="skull"))

    assert res.ok is False
    assert "icon" in [e.field for e in res.errors]


def test_fixed_day_outside_1_to_31_fails():
    assert not validate_bill_data(valid_raw(due_rule_day=0)).ok
    assert not validate_bill_data(valid_raw(due_rule_day=32)).ok
    res = validate_bill_data(valid_raw(due_rule_day=40))
    assert res.ok is False
    assert "dueRuleDay" in [e.field for e in res.errors]


def test_invalid_day_adds_no_spurious_kind_error():
    # Valid kind (dia-fixo) with an out-of-range day: only the day error, never
    # a contradictory "invalid due-rule kind" on the dueRuleKind field.
    res = validate_bill_data(valid_raw(due_rule_day=40))

    assert res.ok is False
    error_fields = [e.field for e in res.errors]
    assert "dueRuleDay" in error_fields
    assert "dueRuleKind" not in error_fields


def test_nth_business_day_builds_correct_union():
    res = validate_bill_data(
        valid_raw(due_rule_kind="n-esimo-dia-util", due_rule_day=None, due_rule_nth=5)
    )

    assert res.ok is True
    assert res.value.due_rule == NthBusinessDayRule(nth=5)


def test_nth_without_nth_fails():
    res = validate_bill_data(
        valid_raw(due_rule_kind="n-esimo-dia-util", due_rule_day=None, due_rule_nth=None)
    )

    assert res.ok is False
    assert "dueRuleNth" in [e.field for e in res.errors]


def test_last_business_day_needs_no_parameter():
    res = validate_bill_data(valid_raw(due_rule_kind="ultimo-dia-util", due_rule_day=None))

    assert res.ok is True
    assert res.value.due_rule == LastBusinessDayRule()


def test_unknown_due_rule_kind_fails():
    res = validate_bill_data(valid_raw(due_rule_kind="quando-der"))

    assert res.ok is False
    assert "dueRuleKind" in [e.field for e in res.errors]


def test_missing_offset_becomes_zero():
    res = validate_bill_data(valid_raw(due_month_offset=None))

    assert res.ok is True
    assert res.value.due_month_offset == 0


def test_condo_plus_one_offset_passes():
    # the "January" condo fee is due in February (offset +1) — real grilling case
    res = validate_bill_data(valid_raw(due_month_offset=1))

    assert res.ok is True
    assert res.value.due_month_offset == 1


def test_negative_offset_fails():
    res = validate_bill_data(valid_raw(due_month_offset=-1))

    assert res.ok is False
    assert "dueMonthOffset" in [e.field for e in res.errors]


def test_registration_never_accepts_amount():
    # The rule has no amount field (invariant #5): BillData does not expose it
    # and the validated output never carries one.
    res = validate_bill_data(valid_raw())

    assert res.ok is True
    assert "amount_cents" not in {f.name for f in fields(res.value)}
