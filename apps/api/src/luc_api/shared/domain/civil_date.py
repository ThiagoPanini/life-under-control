"""Civil dates of the domain (`datetime.date`) — never timestamps (#3).

Parsing, pt-BR formatting and reading what the couple types in the chat. Pure:
"today" is always injected, never read from a clock here. The reference period
(Competência) stays a `str` "YYYY-MM" — there is no stdlib year-month type.
"""

import re
from datetime import date

__all__ = [
    "WEEKDAYS_ABBREV_PT",
    "format_br_date",
    "is_valid_reference_period",
    "parse_br_date",
    "parse_iso_date",
    "weekday_abbrev",
]

WEEKDAYS_ABBREV_PT = ("dom", "seg", "ter", "qua", "qui", "sex", "sáb")  # product copy

_SHORT_YEAR_DIGITS = 2  # "26" -> 2026
_MAX_YEARS_BACK = 8  # worst case: the gap between two Feb 29 (non-leap century turn)

# re.ASCII: Python's \d matches Unicode digits (JS's is ASCII-only). \Z, not $: Python's
# $ matches before a trailing \n and would accept garbage with a newline.
_ISO_DATE = re.compile(r"\A\d{4}-\d{2}-\d{2}\Z", re.ASCII)
_REFERENCE_PERIOD = re.compile(r"\A\d{4}-(0[1-9]|1[0-2])\Z", re.ASCII)
_BR_DATE = re.compile(r"\A(\d{1,2})/(\d{1,2})(?:/(\d{2}|\d{4}))?\Z", re.ASCII)


def weekday_abbrev(day: date) -> str:
    """Abbreviated pt-BR weekday of a civil date (2026-07-06 -> "seg"), as product copy."""
    # `weekday()` has monday=0; shift to sunday=0 (like the TS getUTCDay).
    return WEEKDAYS_ABBREV_PT[(day.weekday() + 1) % 7]


def is_valid_reference_period(text: str) -> bool:
    """Is this a reference period (Competência) — `year-month` (YYYY-MM), month 01 to 12?"""
    return _REFERENCE_PERIOD.match(text) is not None


def parse_iso_date(text: str) -> date | None:
    """Parses an ISO civil date (YYYY-MM-DD) — `None` if malformed or not a real day.

    Rejects crooked shapes, months outside 1-12 and nonexistent days (Feb 29 in a
    common year, day 31 in a short month). Edges turn text into `date` here, and the
    domain only ever sees real dates ("parse, don't validate" — ADR-0015).
    """
    if not _ISO_DATE.match(text):
        return None
    year, month, day = (int(part) for part in text.split("-"))
    return _real_date_or_none(year, month, day)


def format_br_date(day: date) -> str:
    """Formats a civil date in pt-BR (2026-06-29 -> "29/06/2026")."""
    return f"{day.day:02d}/{day.month:02d}/{day.year:04d}"


def parse_br_date(text: str, today: date) -> date | None:
    """Reads `dd/mm` or `dd/mm/yyyy` (2- or 4-digit year) into a `date` — `None` if unreal.

    Without a year, picks the most recent past occurrence — a receipt is always a
    payment already made (never in the future): steps back year by year from `today`
    until a real, non-future date matches. Pure: `today` is injected, no clock here.
    """
    matched = _BR_DATE.match(text.strip())
    if not matched:
        return None

    day = int(matched.group(1))
    month = int(matched.group(2))

    if matched.group(3) is not None:
        # An explicit year states the couple's intent — check it is real, without
        # forcing it into the past.
        raw_year = matched.group(3)
        year = int(f"20{raw_year}") if len(raw_year) == _SHORT_YEAR_DIGITS else int(raw_year)
        return _real_date_or_none(year, month, day)

    # No year: walk down from today's year to the first real, non-future occurrence.
    # range excludes the end; the -1 keeps the full _MAX_YEARS_BACK stretch (worst
    # case Feb 29 at a non-leap century turn: 2096, 8 years behind 2104).
    for year in range(today.year, today.year - _MAX_YEARS_BACK - 1, -1):
        candidate = _real_date_or_none(year, month, day)
        if candidate is not None and candidate <= today:
            return candidate
    return None


def _real_date_or_none(year: int, month: int, day: int) -> date | None:
    """The `date` when the calendar day exists, else `None` (Feb 29, day 31 in a short month)."""
    try:
        return date(year, month, day)
    except ValueError:
        return None
