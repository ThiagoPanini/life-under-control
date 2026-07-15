"""Backfill domain: deterministic cross-check of sheet vs receipts (Seams 1-2).

Oracle: apps/web/src/core/domain/backfill.test.ts, suite ported 1:1.
Civil dates in receipts/manifest are `datetime.date` (ADR-0015) — the vision
pass at the edge parses the strings.
"""

from dataclasses import replace
from datetime import date

from luc_api.finance.domain.backfill import (
    BackfillBill,
    BillEntry,
    ExtractedReceipt,
    ReceiptName,
    SheetRow,
    backfill_bill_raw,
    build_manifest,
    first_reference_period_of,
    parse_receipt_name,
    receipt_reference_period,
)
from luc_api.finance.domain.bill import validate_bill_data


def entry(**over: object) -> BillEntry:
    """A `BillEntry` for the cross-check, overridable per scenario."""
    base = BillEntry(bill_id="bill-luz", paid_by="p-thi", sheet=[], receipts=[])
    return replace(base, **over)  # type: ignore[arg-type]


# --- construirManifesto → build_manifest (Seam 1 — cross-check sheet vs receipts) ---


def test_legible_receipt_matches_reference_period_and_imports_with_date():
    m = build_manifest(
        entry(
            sheet=[SheetRow(reference_period="2024-03", amount_cents=20390, status="Pago")],
            receipts=[
                ExtractedReceipt(
                    file_path="luz/2024/conta-luz-202403.jpeg",
                    reference_period="2024-03",
                    paid_on=date(2024, 3, 15),
                    receipt_amount_cents=20390,
                    mime_type="image/jpeg",
                )
            ],
        )
    )

    assert len(m) == 1
    assert m[0].bill_id == "bill-luz"
    assert m[0].reference_period == "2024-03"
    assert m[0].paid_on == date(2024, 3, 15)
    assert m[0].amount_cents == 20390
    assert m[0].paid_by == "p-thi"
    assert m[0].needs_review is False
    assert m[0].receipt is not None
    assert "conta-luz-202403" in m[0].receipt.file_path
    assert m[0].flags == ["ok"]


def test_missing_receipt_becomes_paid_without_date_and_needs_no_review():
    m = build_manifest(
        entry(
            sheet=[SheetRow(reference_period="2024-04", amount_cents=18000, status="Pago")],
            receipts=[],
        )
    )

    assert m[0].paid_on is None
    assert m[0].amount_cents == 18000
    assert m[0].receipt is None
    assert "sem-recibo" in m[0].flags
    assert m[0].needs_review is False


def test_diverging_amount_flags_review_without_inserting():
    m = build_manifest(
        entry(
            sheet=[SheetRow(reference_period="2024-05", amount_cents=20000, status="Pago")],
            receipts=[
                ExtractedReceipt(
                    file_path="luz/2024/conta-luz-202405.jpg",
                    reference_period="2024-05",
                    paid_on=date(2024, 5, 10),
                    receipt_amount_cents=25000,
                    mime_type="image/jpeg",
                )
            ],
        )
    )

    assert "valor-divergente" in m[0].flags
    assert m[0].needs_review is True


def test_receipt_without_legible_date_imports_without_date():
    m = build_manifest(
        entry(
            sheet=[SheetRow(reference_period="2024-06", amount_cents=19000, status="Pago")],
            receipts=[
                ExtractedReceipt(
                    file_path="luz/2024/conta-luz-202406.jpg",
                    reference_period="2024-06",
                    paid_on=None,
                    receipt_amount_cents=19000,
                    mime_type="image/jpeg",
                )
            ],
        )
    )

    assert m[0].paid_on is None
    assert "data-ilegivel" in m[0].flags
    assert m[0].needs_review is False
    assert m[0].receipt is not None


def test_orphan_receipt_without_sheet_row_goes_to_review():
    m = build_manifest(
        entry(
            sheet=[],
            receipts=[
                ExtractedReceipt(
                    file_path="luz/2023/conta-luz-202310.jpeg",
                    reference_period="2023-10",
                    paid_on=date(2023, 10, 9),
                    receipt_amount_cents=15000,
                    mime_type="image/jpeg",
                )
            ],
        )
    )

    assert "sem-planilha" in m[0].flags
    assert m[0].needs_review is True


def test_pending_row_does_not_enter_the_manifest():
    m = build_manifest(
        entry(sheet=[SheetRow(reference_period="2026-07", amount_cents=0, status="Pendente")])
    )

    assert len(m) == 0


# --- lerNomeRecibo → parse_receipt_name (Seam 1 — file name → bill + reference period) ---


def test_reads_folder_slug_and_reference_period_from_suffix():
    assert parse_receipt_name("gas/2024/gas-202403.jpeg") == ReceiptName(
        bill_slug="gas", reference_period="2024-03"
    )


def test_file_prefix_differing_from_folder_the_folder_wins():
    # luz keeps files named `conta-luz-YYYYMM`; the Bill slug is the folder `luz`.
    assert parse_receipt_name("luz/2023/conta-luz-202310.jpeg") == ReceiptName(
        bill_slug="luz", reference_period="2023-10"
    )


def test_accepts_pdf_and_hyphenated_folder():
    assert parse_receipt_name("plano-celular/2024/plano-celular-202401.pdf") == ReceiptName(
        bill_slug="plano-celular", reference_period="2024-01"
    )


def test_no_reference_period_in_name_returns_none():
    assert parse_receipt_name("luz/2024/leia-me.txt") is None


def test_month_out_of_range_returns_none():
    assert parse_receipt_name("luz/2024/luz-202413.jpg") is None


# --- competenciaDoRecibo → receipt_reference_period (Seam 2 — legacy-name translation) ---


def test_legacy_root_translates_name_by_bill_offset():
    assert receipt_reference_period("condominio/2024/condominio-202401.jpeg", 1, False) == (
        ReceiptName(bill_slug="condominio", reference_period="2024-02")
    )


def test_translation_rolls_the_year_when_name_is_december():
    assert receipt_reference_period("condominio/2024/condominio-202412.jpeg", 1, False) == (
        ReceiptName(bill_slug="condominio", reference_period="2025-01")
    )


def test_corrected_root_reads_without_translation():
    assert receipt_reference_period("condominio/2024/condominio-202401.jpeg", 1, True) == (
        ReceiptName(bill_slug="condominio", reference_period="2024-01")
    )


def test_zero_offset_reads_the_name_as_is():
    assert receipt_reference_period("luz/2023/conta-luz-202310.jpeg", 0, False) == (
        ReceiptName(bill_slug="luz", reference_period="2023-10")
    )


def test_unreadable_name_returns_none_even_with_offset():
    assert receipt_reference_period("luz/2024/leia-me.txt", 1, False) is None


# --- billBrutoDeConta + primeiraCompetenciaDe (Seam 2 — Bill registration post-0008) ---


def test_bill_raw_carries_first_reference_period_and_validates():
    raw = backfill_bill_raw(
        BackfillBill(name="Luz", icon="zap", due_day=15, due_month_offset=0), "2023-10"
    )

    assert raw.first_reference_period == "2023-10"
    assert validate_bill_data(raw).ok is True


def test_first_reference_period_is_the_smallest_paid_sheet_row():
    first = first_reference_period_of(
        [
            SheetRow(reference_period="2024-02", amount_cents=100, status="Pago"),
            SheetRow(reference_period="2023-10", amount_cents=100, status="Pago"),
            SheetRow(reference_period="2023-09", amount_cents=100, status="Pendente"),
        ],
        "2026-07",
    )

    assert first == "2023-10"


def test_sheet_without_paid_row_falls_back_to_current_month():
    assert first_reference_period_of([], "2026-07") == "2026-07"


# --- valorRecibo in the manifest (Seam 2 — adjudication input) ---


def test_row_with_receipt_carries_the_amount_read_from_it():
    m = build_manifest(
        entry(
            sheet=[SheetRow(reference_period="2024-05", amount_cents=20000, status="Pago")],
            receipts=[
                ExtractedReceipt(
                    file_path="luz/2024/conta-luz-202405.jpg",
                    reference_period="2024-05",
                    paid_on=date(2024, 5, 10),
                    receipt_amount_cents=25000,
                    mime_type="image/jpeg",
                )
            ],
        )
    )

    assert m[0].receipt_amount_cents == 25000


def test_row_without_receipt_has_null_receipt_amount():
    m = build_manifest(
        entry(sheet=[SheetRow(reference_period="2024-04", amount_cents=18000, status="Pago")])
    )

    assert m[0].receipt_amount_cents is None


def test_v2_receipt_with_printed_fields_does_not_change_the_cross_check():
    m = build_manifest(
        entry(
            sheet=[SheetRow(reference_period="2024-03", amount_cents=20390, status="Pago")],
            receipts=[
                ExtractedReceipt(
                    file_path="luz/2024/conta-luz-202403.jpeg",
                    reference_period="2024-03",
                    paid_on=date(2024, 3, 15),
                    receipt_amount_cents=20390,
                    mime_type="image/jpeg",
                    printed_due_date=date(2024, 3, 15),
                    printed_reference_period="2024-03",
                )
            ],
        )
    )

    assert m[0].flags == ["ok"]
    assert m[0].needs_review is False
