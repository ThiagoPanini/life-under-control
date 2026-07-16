"""Finance application layer: use-cases, their ports and the derive-* projections.

Map: ports + handmade fakes in `bill_repo`, `payment_repo`, `attachment_repo`,
`attachment_store`, `calendar`, `notifier` and `digest_send_log`; Bill use-cases
in `create_bill`, `list_bills`, `edit_bill`, `close_bill`, `reactivate_bill` and
`delete_bill`; Payment use-cases in `record_payment`, `edit_payment` and
`delete_payment`; Attachment use-cases in `prepare_attachment_upload`,
`register_attachment` and `remove_attachment`; the deterministic historical
import in `import_backfill`. Read-side projections (issue #189, never a
column): `bill_card`, `occurrence_state`, `reference_period_shape`,
`historical_analysis`, `punctuality`, `agenda_projection`, `finance_aggregates`,
`month_scenario`, `month_highlights`, `dashboard_attention`,
`reference_period_bars`, `year_map`, `agenda`, `monthly_panorama` and
`analytics_view`; the WhatsApp due-date digest's content in
`due_digest_content` and its send use-case in `send_due_digest`. May depend on
`domain`; must never import adapters or any framework.
"""

from luc_api.finance.application.agenda import AgendaGroup, AgendaItemView, derive_agenda
from luc_api.finance.application.agenda_projection import AgendaArea, AgendaItem, project_agenda
from luc_api.finance.application.analytics_view import (
    AnalyticsRow,
    ValueDeviation,
    derive_analytics_view,
)
from luc_api.finance.application.attachment_repo import (
    AttachmentRepo,
    FakeAttachmentRepo,
    NewAttachment,
)
from luc_api.finance.application.attachment_store import (
    AttachmentStore,
    FakeAttachmentStore,
    FakeStoredObject,
    StoredObjectMeta,
)
from luc_api.finance.application.bill_card import (
    OCCURRENCES_IN_WINDOW,
    PROXIMITY_THRESHOLD_DAYS,
    TOLERANCE_THRESHOLD_DAYS,
    BeaconState,
    BillCard,
    GridCell,
    GridState,
    PaymentsSummary,
    add_months,
    beacon_of_month,
    default_payment_reference_period,
    default_payment_reference_period_from_grid,
    derive_bill_card,
    grid_occurrences,
    is_recurrence_occurrence,
    payments_summary,
    recent_occurrences,
    reference_period_of,
    resolve_due_date,
)
from luc_api.finance.application.bill_repo import BillDependents, BillRepo, NewBill
from luc_api.finance.application.calendar import Calendar, FakeCalendar
from luc_api.finance.application.close_bill import close_bill
from luc_api.finance.application.create_bill import InvalidBillError, create_bill
from luc_api.finance.application.dashboard_attention import (
    ActiveAreaHero,
    AttentionItem,
    AttentionStrip,
    DashboardAttention,
    NextItem,
    derive_active_area_hero,
    derive_attention_strip,
    derive_dashboard_attention,
)
from luc_api.finance.application.delete_bill import delete_bill, deletion_summary
from luc_api.finance.application.delete_payment import delete_payment
from luc_api.finance.application.digest_send_log import DigestSendLog, FakeDigestSendLog
from luc_api.finance.application.due_digest_content import DigestParams, derive_digest_content
from luc_api.finance.application.edit_bill import BillNotFoundError, edit_bill
from luc_api.finance.application.edit_payment import PaymentNotFoundError, edit_payment
from luc_api.finance.application.finance_aggregates import (
    SPEND_WINDOW_MONTHS,
    ComparisonState,
    FinanceAggregates,
    MonthComparison,
    MonthlySeriesPoint,
    average_monthly_spend,
    compare_closed_month,
    count_open_bills,
    derive_finance_aggregates,
    derive_total_paid_series,
    estimate_remaining_to_pay,
    points_of,
    total_paid_in_month,
)
from luc_api.finance.application.historical_analysis import (
    HISTORICAL_WINDOW_MONTHS,
    MONTHLY,
    MonthTotalPoint,
    MonthTotalState,
    derive_historical_analysis,
)
from luc_api.finance.application.import_backfill import (
    ImportResult,
    LoadReceipt,
    ReceiptContent,
    import_backfill,
)
from luc_api.finance.application.list_bills import list_bills
from luc_api.finance.application.month_highlights import (
    BiggestPayment,
    BillVariation,
    MonthHighlights,
    derive_month_highlights,
)
from luc_api.finance.application.month_scenario import (
    ClosingProjection,
    ClosingProjectionState,
    MonthScenario,
    ProjectionComparison,
    derive_month_scenario,
)
from luc_api.finance.application.monthly_panorama import (
    DUE_SOON_THRESHOLD_DAYS,
    CardAmount,
    MonthCardState,
    PanoramaCard,
    derive_monthly_panorama,
    estado_da_ocorrencia,
    phrase_of_month_card,
)
from luc_api.finance.application.notifier import FakeNotifier, Notifier, Template
from luc_api.finance.application.occurrence_state import (
    Occurrence,
    beacon_of_occurrence,
    long_reading_of_occurrence,
    phrase_of_occurrence,
    sort_by_urgency,
)
from luc_api.finance.application.payment_repo import FakePaymentRepo, NewPayment, PaymentRepo
from luc_api.finance.application.prepare_attachment_upload import (
    InvalidAttachmentError,
    PreparedUpload,
    prepare_attachment_upload,
)
from luc_api.finance.application.punctuality import (
    PunctualityDetail,
    PunctualityState,
    calculate_bill_punctuality,
    calculate_punctuality_12m,
    detail_bill_punctuality,
)
from luc_api.finance.application.reactivate_bill import reactivate_bill
from luc_api.finance.application.record_payment import InvalidPaymentError, record_payment
from luc_api.finance.application.reference_period_bars import (
    BarPoint,
    BarState,
    closed_values,
    reference_period_bar_points,
)
from luc_api.finance.application.reference_period_shape import (
    MarkerState,
    PriorPending,
    ReferencePeriodShape,
    SettledCount,
    TrackMarker,
    bills_of_month,
    count_settled,
    derive_reference_period_shape,
    derive_track_markers,
    estimate_remaining_for_month,
    historical_average_up_to,
    list_prior_pending,
    project_month_spend,
    sum_paid_in_month,
)
from luc_api.finance.application.register_attachment import register_attachment
from luc_api.finance.application.remove_attachment import remove_attachment
from luc_api.finance.application.send_due_digest import (
    DIGEST_LANGUAGE,
    DIGEST_TEMPLATE,
    DigestDeps,
    DigestSendResult,
    send_due_digest,
)
from luc_api.finance.application.year_map import (
    YEAR_MAP_WINDOW_MONTHS,
    CellState,
    MapCell,
    MapRow,
    ValueClassification,
    YearMap,
    classify_value,
    derive_year_map,
)

__all__ = [
    "DIGEST_LANGUAGE",
    "DIGEST_TEMPLATE",
    "DUE_SOON_THRESHOLD_DAYS",
    "HISTORICAL_WINDOW_MONTHS",
    "MONTHLY",
    "OCCURRENCES_IN_WINDOW",
    "PROXIMITY_THRESHOLD_DAYS",
    "SPEND_WINDOW_MONTHS",
    "TOLERANCE_THRESHOLD_DAYS",
    "YEAR_MAP_WINDOW_MONTHS",
    "ActiveAreaHero",
    "AgendaArea",
    "AgendaGroup",
    "AgendaItem",
    "AgendaItemView",
    "AnalyticsRow",
    "AttachmentRepo",
    "AttachmentStore",
    "AttentionItem",
    "AttentionStrip",
    "BarPoint",
    "BarState",
    "BeaconState",
    "BiggestPayment",
    "BillCard",
    "BillDependents",
    "BillNotFoundError",
    "BillRepo",
    "BillVariation",
    "Calendar",
    "CardAmount",
    "CellState",
    "ClosingProjection",
    "ClosingProjectionState",
    "ComparisonState",
    "DashboardAttention",
    "DigestDeps",
    "DigestParams",
    "DigestSendLog",
    "DigestSendResult",
    "FakeAttachmentRepo",
    "FakeAttachmentStore",
    "FakeCalendar",
    "FakeDigestSendLog",
    "FakeNotifier",
    "FakePaymentRepo",
    "FakeStoredObject",
    "FinanceAggregates",
    "GridCell",
    "GridState",
    "ImportResult",
    "InvalidAttachmentError",
    "InvalidBillError",
    "InvalidPaymentError",
    "LoadReceipt",
    "MapCell",
    "MapRow",
    "MarkerState",
    "MonthCardState",
    "MonthComparison",
    "MonthHighlights",
    "MonthScenario",
    "MonthTotalPoint",
    "MonthTotalState",
    "MonthlySeriesPoint",
    "NewAttachment",
    "NewBill",
    "NewPayment",
    "NextItem",
    "Notifier",
    "Occurrence",
    "PanoramaCard",
    "PaymentNotFoundError",
    "PaymentRepo",
    "PaymentsSummary",
    "PreparedUpload",
    "PriorPending",
    "ProjectionComparison",
    "PunctualityDetail",
    "PunctualityState",
    "ReceiptContent",
    "ReferencePeriodShape",
    "SettledCount",
    "StoredObjectMeta",
    "Template",
    "TrackMarker",
    "ValueClassification",
    "ValueDeviation",
    "YearMap",
    "add_months",
    "average_monthly_spend",
    "beacon_of_month",
    "beacon_of_occurrence",
    "bills_of_month",
    "calculate_bill_punctuality",
    "calculate_punctuality_12m",
    "classify_value",
    "close_bill",
    "closed_values",
    "compare_closed_month",
    "count_open_bills",
    "count_settled",
    "create_bill",
    "default_payment_reference_period",
    "default_payment_reference_period_from_grid",
    "delete_bill",
    "delete_payment",
    "deletion_summary",
    "derive_active_area_hero",
    "derive_agenda",
    "derive_analytics_view",
    "derive_attention_strip",
    "derive_bill_card",
    "derive_dashboard_attention",
    "derive_digest_content",
    "derive_finance_aggregates",
    "derive_historical_analysis",
    "derive_month_highlights",
    "derive_month_scenario",
    "derive_monthly_panorama",
    "derive_reference_period_shape",
    "derive_total_paid_series",
    "derive_track_markers",
    "derive_year_map",
    "detail_bill_punctuality",
    "edit_bill",
    "edit_payment",
    "estado_da_ocorrencia",
    "estimate_remaining_for_month",
    "estimate_remaining_to_pay",
    "grid_occurrences",
    "historical_average_up_to",
    "import_backfill",
    "is_recurrence_occurrence",
    "list_bills",
    "list_prior_pending",
    "long_reading_of_occurrence",
    "payments_summary",
    "phrase_of_month_card",
    "phrase_of_occurrence",
    "points_of",
    "prepare_attachment_upload",
    "project_agenda",
    "project_month_spend",
    "reactivate_bill",
    "recent_occurrences",
    "record_payment",
    "reference_period_bar_points",
    "reference_period_of",
    "register_attachment",
    "remove_attachment",
    "resolve_due_date",
    "send_due_digest",
    "sort_by_urgency",
    "sum_paid_in_month",
    "total_paid_in_month",
]
