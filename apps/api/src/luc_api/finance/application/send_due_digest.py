"""Send the daily due-date digest to both Users of the Household (issue #160, phase 2).

Decision log (issue #189 adjudications):

- The digest lives in `finance`, not in a WhatsApp-named context: the domain
  reason drives it (PRD of ADR-0012) — the channel is an adapter detail, the
  trigger is a Finance fact (a Bill asking for attention).
- `Notifier` is a MINIMAL port (just `send_template`): the digest never sends
  free text, buttons or lists — the full messenger contract belongs to the
  slice that implements this port.
- The claim/release dedup log is named `DigestSendLog`, not after the WhatsApp
  webhook's event table — it is scoped to exactly what this use-case needs (one
  claim per day per recipient); a concrete adapter is free to reuse the same
  underlying table as the webhook's idempotency guard.
- `HouseholdRepo` is imported from `identity` — a cross-context dependency
  (`finance` -> `identity`) accepted for now; no import-linter independence
  contract exists between contexts yet, only the per-container hexagonal-layers
  one.
- The TS oracle injects a `log` callback (default `console.log`) only to keep
  the use-case off a JS global; Python already has that decoupling via the
  stdlib `logging` module, so this port calls `logging.getLogger(__name__)`
  directly instead of threading a log dependency through `DigestDeps`.
- Single clock read: `derive_digest_content` and the day's dedup key must agree
  on the SAME day, or a run at the midnight boundary could key the claim under
  a different day than the derived content — `clock.today()` is read once and
  reused everywhere via a `FixedClock`.
"""

import logging
from dataclasses import dataclass
from datetime import date
from typing import Literal

from luc_api.finance.application.bill_repo import BillRepo
from luc_api.finance.application.calendar import Calendar
from luc_api.finance.application.digest_send_log import DigestSendLog
from luc_api.finance.application.due_digest_content import derive_digest_content
from luc_api.finance.application.notifier import Notifier, Template
from luc_api.finance.application.payment_repo import PaymentRepo
from luc_api.identity.application.household_repo import HouseholdRepo
from luc_api.shared.application.clock import Clock, FixedClock

__all__ = [
    "DIGEST_LANGUAGE",
    "DIGEST_TEMPLATE",
    "DigestDeps",
    "DigestSendResult",
    "send_due_digest",
]

logger = logging.getLogger(__name__)

DIGEST_TEMPLATE = "digest_vencimentos"
"""The approved utility template (issue #157)."""

DIGEST_LANGUAGE = "pt_BR"


@dataclass(frozen=True)
class DigestDeps:
    """Every port `send_due_digest` needs, bundled — this use-case's arity earns the bundle."""

    household_repo: HouseholdRepo
    bill_repo: BillRepo
    payment_repo: PaymentRepo
    send_log: DigestSendLog
    notifier: Notifier
    clock: Clock
    calendar: Calendar


@dataclass(frozen=True)
class DigestSendResult:
    """The outcome of one digest run."""

    status: Literal["sem-lar", "nada-a-enviar", "enviado"]
    sent: int | None = None
    """Templates the channel actually accepted."""
    already_sent: int | None = None
    """Users whose digest for the day was already sent (dedup)."""
    failed: int | None = None
    """Sends the channel refused — the claim was released for the next run."""
    without_phone: int | None = None
    """Users without a linked WhatsApp number, skipped."""


def _send_log_key(today: date, phone: str) -> str:
    """The dedup key: one digest per day per phone (AC of issue #160)."""
    return f"digest:{today.isoformat()}:{phone}"


_MASK_MIN_VISIBLE_DIGITS = 4
"""Below this many digits there is nothing left to show past the 2+2 suffix — mask it whole."""


def _mask_phone(phone: str) -> str:
    """Masks an E.164 phone for an auditable log — keeps the leading `+` and the last 2 digits.

    A number too short to leave anything past the suffix is masked whole, so it
    never accidentally reveals the full number.
    """
    has_sign = phone.startswith("+")
    rest = phone[1:] if has_sign else phone
    if len(rest) <= _MASK_MIN_VISIBLE_DIGITS:
        masked = "*" * len(rest)
    else:
        masked = f"{rest[:2]}{'*' * (len(rest) - _MASK_MIN_VISIBLE_DIGITS)}{rest[-2:]}"
    return f"+{masked}" if has_sign else masked


async def send_due_digest(deps: DigestDeps) -> DigestSendResult:
    """Sends the daily due-date digest to both Users of the Household (#160, phase 2).

    Derives the content on the fly from `derive_digest_content` (no persisted
    state, invariant #3; ADR-0012): a Bill paid this morning is already gone
    from an afternoon run. Only sends when some Bill asks for attention.

    Dedup per day/User via `send_log`, with compensation: claims **before**
    sending (the unique key closes the race between concurrent runs) and, if
    the channel refuses the template, **releases** the claim — so a new run (or
    an endpoint re-hit) retries instead of the day staying poisoned by a failed
    send.
    """
    household = await deps.household_repo.load_household()
    if household is None:
        logger.info("digest: no Household, nothing sent")
        return DigestSendResult(status="sem-lar")

    bills = await deps.bill_repo.list_bills(household.id)
    payments = await deps.payment_repo.list_all_payments(household.id)

    today = deps.clock.today()
    frozen_clock = FixedClock(today)

    content = derive_digest_content(frozen_clock, deps.calendar, bills, payments)
    if content is None:
        logger.info("digest: no Bill asking for attention, nothing sent")
        return DigestSendResult(status="nada-a-enviar")

    params = (content.overdue, content.due_soon, content.estimated_total)

    sent = 0
    already_sent = 0
    failed = 0
    without_phone = 0

    for user in household.users:
        phone = user.whatsapp_phone
        if not phone:
            without_phone += 1
            continue

        key = _send_log_key(today, phone)
        claimed = await deps.send_log.claim(key)
        if not claimed:
            already_sent += 1
            logger.info(
                "digest: %s already sent to %s, skipped", today.isoformat(), _mask_phone(phone)
            )
            continue

        delivered = await deps.notifier.send_template(
            phone, Template(name=DIGEST_TEMPLATE, language=DIGEST_LANGUAGE, params=params)
        )
        if not delivered:
            await deps.send_log.release(key)
            failed += 1
            logger.info("digest: send to %s failed, claim released", _mask_phone(phone))
            continue

        sent += 1

    return DigestSendResult(
        status="enviado",
        sent=sent,
        already_sent=already_sent,
        failed=failed,
        without_phone=without_phone,
    )
