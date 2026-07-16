"""Historical Finance backfill — pure core (ADR-0003).

The ingestion tool (issue #24) has two halves: a **vision pass** reads the
receipts and extracts date/amount (the edge, with IO and a model), and this
module does the **deterministic cross-check** that matches what the control
sheet (planilha) claims against what the receipts show, emitting a checkable
**manifest**. No IO here: the edge brings `ExtractedReceipt` lists per Bill;
this decides what to import, what becomes "paid without date" and what falls to
manual review — no silent insertion.

The sheet is the truth of the **amount** (the operator's cash book); the
receipt is the truth of the **date** (when it was actually paid) and the
attachable proof. An amount divergence between the two never enters silently —
it becomes review.
"""

import re
from dataclasses import dataclass, replace
from datetime import date
from typing import Literal

from luc_api.finance.domain.bill import BillRaw

__all__ = [
    "BackfillBill",
    "BillEntry",
    "ExtractedReceipt",
    "ManifestFlag",
    "ManifestReceipt",
    "ManifestRow",
    "ReceiptName",
    "SheetRow",
    "add_months",
    "backfill_bill_raw",
    "build_manifest",
    "first_reference_period_of",
    "parse_receipt_name",
    "receipt_reference_period",
]


@dataclass(frozen=True)
class ReceiptName:
    """What a receipt's file name reveals: the Bill (folder) and the reference period."""

    bill_slug: str
    reference_period: str


_REFERENCE_PERIOD_SUFFIX_RE = re.compile(r"(\d{4})(\d{2})\.[^.]+$")
_DECEMBER = 12


def add_months(reference_period: str, n: int) -> str:
    """Add `n` months to a `YYYY-MM` reference period (negative ok), rolling the year."""
    year, month = (int(part) for part in reference_period.split("-"))
    total = year * 12 + (month - 1) + n
    return f"{total // 12}-{total % 12 + 1:02d}"


def parse_receipt_name(relative_path: str) -> ReceiptName | None:
    """Read a receipt file name organized as `<bill>/<year>/<...>-YYYYMM.ext`.

    Returns the Bill slug (the **folder**, not the file prefix — `luz` keeps
    `conta-luz-YYYYMM` files) and the `YYYY-MM` reference period. `None` when
    there is no readable `YYYYMM` at the end of the name or the month falls
    outside 01-12. Pure — the edge passes the path relative to the receipts root.
    """
    m = _REFERENCE_PERIOD_SUFFIX_RE.search(relative_path)
    if m is None:
        return None
    year, month = m.group(1), m.group(2)
    if not 1 <= int(month) <= _DECEMBER:
        return None
    bill_slug = relative_path.split("/", maxsplit=1)[0]
    if not bill_slug:
        return None
    return ReceiptName(bill_slug=bill_slug, reference_period=f"{year}-{month}")


def receipt_reference_period(
    relative_path: str, legacy_name_offset: int, root_corrected: bool
) -> ReceiptName | None:
    """Read a receipt name translating the **legacy naming lag**.

    In the old roots (OneDrive) some Bills recorded in the name the month before
    the real reference period (Competência = due month — decision of
    2026-07-04), and those originals stay untouched forever. `legacy_name_offset`
    is the Bill's shift (name + offset = real reference period). The
    anti-double-shift guard: `root_corrected=True` (root already renamed to the
    truth) reads the name as is — translating again would shift twice.
    """
    name = parse_receipt_name(relative_path)
    if name is None:
        return None
    if root_corrected or legacy_name_offset == 0:
        return name
    return replace(name, reference_period=add_months(name.reference_period, legacy_name_offset))


@dataclass(frozen=True)
class BackfillBill:
    """What the edge catalog states about a Bill for the backfill registration."""

    name: str
    icon: str
    due_day: int
    due_month_offset: int


def backfill_bill_raw(bill: BackfillBill, first_reference_period: str) -> BillRaw:
    """Build the `BillRaw` of a backfill Bill registration.

    **With** the `first_reference_period`, mandatory since migration 0008
    (without it, `create_bill` refuses the registration; the idempotent path of
    an already-existing Bill used to mask the omission).
    """
    return BillRaw(
        name=bill.name,
        description=None,
        icon=bill.icon,
        interval_months=1,
        anchor_month=None,
        due_rule_kind="dia-fixo",
        due_rule_day=bill.due_day,
        due_month_offset=bill.due_month_offset,
        first_reference_period=first_reference_period,
    )


@dataclass(frozen=True)
class SheetRow:
    """One control-sheet row for a Bill: the expected reference period and amount."""

    reference_period: str
    """Year-month (`YYYY-MM`) the payment refers to."""
    amount_cents: int
    """Expected amount, integer BRL cents (invariant #6)."""
    status: str
    """Sheet state — only `"Pago"` becomes a Payment; `"Pendente"` is ignored."""


def first_reference_period_of(sheet: list[SheetRow], current_month: str) -> str:
    """Derive a new Bill's first reference period from the sheet: the smallest **paid** row.

    Same rule as the migration-0008 backfill. Without a paid row it falls back
    to the current month — the Bill is born without retroactive vigência.
    """
    paid = [row.reference_period for row in sheet if row.status == "Pago"]
    if not paid:
        return current_month
    return min(paid)


@dataclass(frozen=True, kw_only=True)
class ExtractedReceipt:
    """A receipt already read by the vision pass, before the cross-check."""

    file_path: str
    """Source path of the file (checkable label in the manifest)."""
    reference_period: str
    """Reference period inferred from the file name (`<bill>-YYYYMM`), normalized to `YYYY-MM`."""
    paid_on: date | None
    """Payment date extracted from the receipt; `None` if unreadable."""
    receipt_amount_cents: int | None
    """Amount read from the receipt in cents; `None` if unreadable."""
    mime_type: str
    """MIME type of the file (`image/jpeg`, `application/pdf`…), for the upload."""
    printed_due_date: date | None = None
    """Due date stamped on the document, when readable — v2 receipts (#124).

    The documentary evidence that decides the lag offset and the real due day.
    """
    printed_reference_period: str | None = None
    """Reference month/period stamped (`YYYY-MM`), when the document has it — v2 receipts."""


@dataclass(frozen=True, kw_only=True)
class BillEntry:
    """One Bill's inputs for the cross-check: sheet + receipts + whom to attribute."""

    bill_id: str
    """The already-registered Bill everything here belongs to."""
    paid_by: str
    """The Pessoa to attribute Payment authorship to (authorship, not permission — #1)."""
    sheet: list[SheetRow]
    """Control-sheet rows of this Bill."""
    receipts: list[ExtractedReceipt]
    """Receipts extracted by the vision pass for this Bill."""


type ManifestFlag = Literal[
    "ok",  # readable receipt, amount matches, date present
    "sem-recibo",  # sheet says paid, but no receipt found → without date
    "data-ilegivel",  # receipt found, but no readable date → without date
    "valor-divergente",  # receipt amount ≠ sheet amount → review
    "sem-planilha",  # orphan receipt, no "Pago" sheet row → review
]
"""The cross-check findings of one row — the "why" of its state, checkable in the manifest."""


@dataclass(frozen=True)
class ManifestReceipt:
    """The reference to the receipt to attach (path + type), when there is one."""

    file_path: str
    mime_type: str


@dataclass(frozen=True, kw_only=True)
class ManifestRow:
    """One manifest row: what the deterministic import will (or will not) insert."""

    bill_id: str
    reference_period: str
    paid_on: date | None
    """Payment date to persist; `None` is the "paid without date" state."""
    amount_cents: int
    """Amount to persist, cents — the sheet's truth."""
    receipt_amount_cents: int | None
    """Amount read from the receipt (cents); `None` without receipt or unreadable.

    The adjudication input.
    """
    paid_by: str
    receipt: ManifestReceipt | None
    """The receipt to upload/attach, if any."""
    flags: list[ManifestFlag]
    """The cross-check findings (always at least one)."""
    needs_review: bool
    """Divergence asking for a human eye — the import does **not** insert such rows."""


def build_manifest(entry: BillEntry) -> list[ManifestRow]:
    """Match one Bill's sheet against its receipts and emit the manifest.

    For each **paid** sheet row it looks for the receipt of the same reference
    period: when there is one, it takes its date and checks the amount
    (divergence → review); when missing, it marks "paid without date" without
    asking for review (a known state, not an error). A receipt without a
    matching paid row is an orphan — it enters as review (no trustworthy amount,
    nothing is inserted blindly). `Pendente` rows never become Payments.
    """
    receipts_by_period: dict[str, ExtractedReceipt] = {}
    for receipt in entry.receipts:
        receipts_by_period.setdefault(receipt.reference_period, receipt)

    rows: list[ManifestRow] = []
    consumed: set[str] = set()

    for sheet_row in entry.sheet:
        if sheet_row.status != "Pago":
            continue
        receipt = receipts_by_period.get(sheet_row.reference_period)
        flags: list[ManifestFlag] = []
        paid_on: date | None = None
        receipt_ref: ManifestReceipt | None = None

        if receipt is not None:
            consumed.add(sheet_row.reference_period)
            receipt_ref = ManifestReceipt(file_path=receipt.file_path, mime_type=receipt.mime_type)
            if receipt.paid_on is not None:
                paid_on = receipt.paid_on
            else:
                flags.append("data-ilegivel")
            if (
                receipt.receipt_amount_cents is not None
                and receipt.receipt_amount_cents != sheet_row.amount_cents
            ):
                flags.append("valor-divergente")
        else:
            flags.append("sem-recibo")

        rows.append(
            ManifestRow(
                bill_id=entry.bill_id,
                reference_period=sheet_row.reference_period,
                paid_on=paid_on,
                amount_cents=sheet_row.amount_cents,
                receipt_amount_cents=(
                    receipt.receipt_amount_cents if receipt is not None else None
                ),
                paid_by=entry.paid_by,
                receipt=receipt_ref,
                flags=flags if flags else ["ok"],
                needs_review="valor-divergente" in flags,
            )
        )

    # Orphan receipts: they exist on disk but the sheet does not acknowledge them as paid.
    for receipt in entry.receipts:
        if receipt.reference_period in consumed:
            continue
        if any(
            row.reference_period == receipt.reference_period and row.status == "Pago"
            for row in entry.sheet
        ):
            continue
        rows.append(
            ManifestRow(
                bill_id=entry.bill_id,
                reference_period=receipt.reference_period,
                paid_on=receipt.paid_on,
                amount_cents=(
                    receipt.receipt_amount_cents if receipt.receipt_amount_cents is not None else 0
                ),
                receipt_amount_cents=receipt.receipt_amount_cents,
                paid_by=entry.paid_by,
                receipt=ManifestReceipt(file_path=receipt.file_path, mime_type=receipt.mime_type),
                flags=["sem-planilha"],
                needs_review=True,
            )
        )
        consumed.add(receipt.reference_period)

    return rows
