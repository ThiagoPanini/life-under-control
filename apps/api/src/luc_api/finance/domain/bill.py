"""Bill (Conta): the recurring-payment rule of the Household — projects the "when", never the "how much" (invariant #5).

State values (`ativa`/`encerrada`), due-rule kinds (`dia-fixo`/...) and error
`field` ids are persisted/edge contracts and stay as in the TS oracle.
"""

from dataclasses import dataclass
from datetime import date
from typing import Literal

from luc_api.finance.domain.validation import FieldError, Invalid, Valid
from luc_api.shared.domain import is_valid_reference_period

__all__ = [
    "BILL_ICONS",
    "Bill",
    "BillData",
    "BillRaw",
    "BillState",
    "BillValidation",
    "DueRule",
    "FixedDayRule",
    "LastBusinessDayRule",
    "NthBusinessDayRule",
    "Recurrence",
    "validate_bill_data",
]

type BillState = Literal["ativa", "encerrada"]
"""Life state of the Bill: `ativa` projects; `encerrada` ceases and keeps history."""


@dataclass(frozen=True)
class FixedDayRule:
    """Due on a fixed calendar day of the month."""

    day: int
    kind: Literal["dia-fixo"] = "dia-fixo"


@dataclass(frozen=True)
class NthBusinessDayRule:
    """Due on the nth business day of the month."""

    nth: int
    kind: Literal["n-esimo-dia-util"] = "n-esimo-dia-util"


@dataclass(frozen=True)
class LastBusinessDayRule:
    """Due on the last business day of the month."""

    kind: Literal["ultimo-dia-util"] = "ultimo-dia-util"


type DueRule = FixedDayRule | NthBusinessDayRule | LastBusinessDayRule
"""Shape of the expected due rule (no date — derived later, #21)."""


@dataclass(frozen=True)
class Recurrence:
    """How often the Bill recurs; `anchor_month` only matters when interval > 1."""

    interval_months: int
    anchor_month: int | None


@dataclass(frozen=True)
class BillData:
    """The user-editable data of a Bill — already validated and normalized."""

    name: str
    description: str | None
    icon: str
    recurrence: Recurrence
    due_rule: DueRule
    due_month_offset: int
    """Month offset: the occurrence is due at reference period + N months (default 0; condo +1)."""
    first_reference_period: str
    """First canonical reference period (Competência, `YYYY-MM`): where vigência starts (invariant #5)."""


@dataclass(frozen=True)
class Bill(BillData):
    """A persisted Bill: the data + identity, owner (Household) and life state."""

    id: str
    household_id: str
    state: BillState
    closed_on: date | None
    """Civil date the Bill was closed on; `None` while `ativa`."""
    logo_key: str | None
    """Key of the logo in the R2 bucket (ADR-0008); `None` without one — `icon` is the fallback."""


@dataclass(frozen=True, kw_only=True)
class BillRaw:
    """Raw registration input (edge-translated form values, possibly invalid)."""

    name: str
    description: str | None = None
    icon: str
    interval_months: int
    anchor_month: int | None = None
    due_rule_kind: str
    due_rule_day: int | None = None
    due_rule_nth: int | None = None
    due_month_offset: int | None = None
    first_reference_period: str | None = None


type BillValidation = Valid[BillData] | Invalid

_NAME_MAX = 80
_DESCRIPTION_MAX = 280
_INTERVAL_MAX = 120
# A civil month has at most ~23 business days; above that, use `ultimo-dia-util`.
_NTH_MAX = 23
_OFFSET_MAX = 12

# Bill icon catalog (Lucide subset; names only — the edge resolves the component,
# the core knows no React). `home` is the persisted id; never rename a stored id.
BILL_ICONS = (
    "building-2",
    "credit-card",
    "zap",
    "droplet",
    "wifi",
    "flame",
    "heart-pulse",
    "graduation-cap",
    "dumbbell",
    "shield",
    "receipt",
    "car",
    "home",
    "smartphone",
    "tv",
    "wallet",
    "shopping-cart",
)


def _is_int_in_range(n: int | None, lo: int, hi: int) -> bool:
    return n is not None and lo <= n <= hi


def validate_bill_data(raw: BillRaw) -> BillValidation:  # noqa: PLR0912 — mirrors the oracle's single function
    """Validate and normalize a Bill registration.

    Single source of the rule: the `create_bill` use-case (the gate) and the
    wizard (the edge) both consume this. Normalizes on the way through.
    """
    errors: list[FieldError] = []

    name = (raw.name or "").strip()
    if not name:
        errors.append(FieldError(field="nome", message="Dê um nome à Conta."))
    elif len(name) > _NAME_MAX:
        errors.append(FieldError(field="nome", message=f"Nome muito longo (máx. {_NAME_MAX})."))

    description_trimmed = (raw.description or "").strip()
    if len(description_trimmed) > _DESCRIPTION_MAX:
        errors.append(
            FieldError(
                field="descricao", message=f"Descrição muito longa (máx. {_DESCRIPTION_MAX})."
            )
        )
    description = description_trimmed or None

    icon = raw.icon
    if icon not in BILL_ICONS:
        errors.append(FieldError(field="icon", message="Escolha um ícone."))

    interval_months = raw.interval_months
    if not _is_int_in_range(interval_months, 1, _INTERVAL_MAX):
        errors.append(FieldError(field="intervalMonths", message="Periodicidade inválida."))

    # The anchor only makes sense when the interval > 1; monthly ignores the value.
    anchor_month: int | None = None
    if interval_months > 1:
        if _is_int_in_range(raw.anchor_month, 1, 12):
            anchor_month = raw.anchor_month
        else:
            errors.append(FieldError(field="anchorMonth", message="Escolha o mês-âncora."))

    due_rule: DueRule | None = None
    match raw.due_rule_kind:
        case "dia-fixo":
            if _is_int_in_range(raw.due_rule_day, 1, 31) and raw.due_rule_day is not None:
                due_rule = FixedDayRule(day=raw.due_rule_day)
            else:
                errors.append(FieldError(field="dueRuleDay", message="Dia do mês entre 1 e 31."))
        case "n-esimo-dia-util":
            if _is_int_in_range(raw.due_rule_nth, 1, _NTH_MAX) and raw.due_rule_nth is not None:
                due_rule = NthBusinessDayRule(nth=raw.due_rule_nth)
            else:
                errors.append(
                    FieldError(
                        field="dueRuleNth", message=f"N-ésimo dia útil entre 1 e {_NTH_MAX}."
                    )
                )
        case "ultimo-dia-util":
            due_rule = LastBusinessDayRule()
        case _:
            errors.append(FieldError(field="dueRuleKind", message="Forma de vencimento inválida."))

    due_month_offset = raw.due_month_offset if raw.due_month_offset is not None else 0
    if not _is_int_in_range(due_month_offset, 0, _OFFSET_MAX):
        errors.append(
            FieldError(field="dueMonthOffset", message=f"Offset de mês entre 0 e {_OFFSET_MAX}.")
        )

    first_reference_period = (raw.first_reference_period or "").strip()
    if not is_valid_reference_period(first_reference_period):
        errors.append(
            FieldError(
                field="primeiraCompetencia", message="Primeira Competência inválida (ano-mês)."
            )
        )

    if due_rule is None or errors:
        return Invalid(errors=errors)

    return Valid(
        value=BillData(
            name=name,
            description=description,
            icon=icon,
            recurrence=Recurrence(interval_months=interval_months, anchor_month=anchor_month),
            due_rule=due_rule,
            due_month_offset=due_month_offset,
            first_reference_period=first_reference_period,
        )
    )
