"""Filing period discovery and selection for 10-K / 10-Q / 20-F / 6-K compare."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from sec.client import (
    ANNUAL_COMPARABLE_FORMS,
    COMPARABLE_FORM_TYPES,
    INTERIM_COMPARABLE_FORMS,
    _filing_date_ord,
    _form_tier,
)


@dataclass(frozen=True)
class PeriodFilter:
    kind: Literal["annual", "interim"]
    fiscal_year: int | None = None
    report_date: str | None = None


def parse_period_param(period: str | None) -> PeriodFilter | None:
    """Parse URL/API period id: ``annual-2024``, ``annual-2024-20f``, or ``interim-2024-09-30``."""
    if not period or not period.strip():
        return None
    value = period.strip().lower()
    if value.startswith("annual-"):
        year_str = value[len("annual-") :]
        if year_str.endswith("-20f"):
            year_str = year_str[: -len("-20f")]
        if year_str.isdigit():
            return PeriodFilter(kind="annual", fiscal_year=int(year_str))
        return None
    if value.startswith("interim-"):
        report_date = value[len("interim-") :]
        if len(report_date) >= 10 and report_date[4] == "-" and report_date[7] == "-":
            return PeriodFilter(
                kind="interim",
                fiscal_year=int(report_date[:4]),
                report_date=report_date[:10],
            )
        return None
    return None


def resolve_period_filter(
    fiscal_year: int | None,
    period: str | None,
) -> PeriodFilter | None:
    parsed = parse_period_param(period)
    if parsed:
        return parsed
    if fiscal_year is not None:
        return PeriodFilter(kind="annual", fiscal_year=fiscal_year)
    return None


def period_is_historical(fiscal_year: int | None, period: str | None) -> bool:
    """True when a period is older than the free-tier window (Pro-only archive)."""
    current_year = datetime.now().year
    pf = resolve_period_filter(fiscal_year, period)
    if not pf:
        return False
    if pf.kind == "annual" and pf.fiscal_year is not None:
        return pf.fiscal_year < current_year - 1
    if pf.kind == "interim" and pf.report_date:
        try:
            return int(pf.report_date[:4]) < current_year - 1
        except ValueError:
            return False
    return False


def completed_fiscal_year_from_most_recent(most_recent: dict[str, Any]) -> int | None:
    """Fiscal year whose annual + quarterly filings are fully in the past."""
    fy = most_recent.get("fiscal_year")
    if fy is None:
        return None
    if most_recent.get("kind") == "annual":
        return fy
    return fy - 1


def filter_free_tier_periods(periods: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Free tier: most recent filing + all periods from the last completed fiscal year."""
    if not periods:
        return []

    most_recent = periods[0]
    completed_fy = completed_fiscal_year_from_most_recent(most_recent)
    allowed_ids: set[str] = {most_recent["id"]}
    if completed_fy is not None:
        for opt in periods:
            if opt.get("fiscal_year") == completed_fy:
                allowed_ids.add(opt["id"])

    return [p for p in periods if p["id"] in allowed_ids]


def resolve_request_period_id(
    fiscal_year: int | None,
    period: str | None,
) -> str | None:
    if period and period.strip():
        return period.strip()
    if fiscal_year is not None:
        return f"annual-{fiscal_year}"
    return None


def period_in_free_allowlist(
    fiscal_year: int | None,
    period: str | None,
    allowed_periods: list[dict[str, Any]],
) -> bool:
    """Whether a parse/financials request matches the free-tier period window."""
    req_id = resolve_request_period_id(fiscal_year, period)
    if req_id is None:
        return True

    allowed_ids = {p["id"] for p in allowed_periods}
    if req_id in allowed_ids:
        return True

    pf = resolve_period_filter(fiscal_year, period)
    if not pf:
        return False

    for opt in allowed_periods:
        if pf.kind == "annual" and opt.get("kind") == "annual" and opt.get("fiscal_year") == pf.fiscal_year:
            return True
        if (
            pf.kind == "interim"
            and opt.get("kind") == "interim"
            and opt.get("report_date") == pf.report_date
        ):
            return True
    return False


def _quarter_from_report_date(report_date: str | None) -> int | None:
    if not report_date or len(report_date) < 7:
        return None
    try:
        month = int(report_date[5:7])
    except ValueError:
        return None
    if month == 3:
        return 1
    if month == 6:
        return 2
    if month == 9:
        return 3
    if month == 12:
        return 4
    return None


def _fp_to_quarter(fp: str | None) -> int | None:
    if fp == "Q1":
        return 1
    if fp == "Q2":
        return 2
    if fp == "Q3":
        return 3
    if fp == "Q4":
        return 4
    return None


def _iter_submission_filings(submissions: dict[str, Any]) -> list[dict[str, Any]]:
    recent = submissions.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    filing_dates = recent.get("filingDate", [])
    primary_docs = recent.get("primaryDocument", [])
    report_dates = recent.get("reportDate", [])

    rows: list[dict[str, Any]] = []
    for i, form in enumerate(forms):
        if form not in COMPARABLE_FORM_TYPES:
            continue
        accession = accessions[i] if i < len(accessions) else None
        if not accession:
            continue
        report_date = report_dates[i] if i < len(report_dates) else filing_dates[i]
        year = int(report_date[:4]) if report_date else None
        rows.append(
            {
                "form": form,
                "accession_number": accession,
                "accession_no_dash": accession.replace("-", ""),
                "filing_date": filing_dates[i] if i < len(filing_dates) else None,
                "report_date": report_date,
                "primary_document": primary_docs[i] if i < len(primary_docs) else None,
                "fiscal_year": year,
            }
        )
    return rows


def _better_filing(candidate: dict[str, Any], existing: dict[str, Any] | None) -> bool:
    if existing is None:
        return True
    c_tier = _form_tier(candidate["form"])
    e_tier = _form_tier(existing["form"])
    if c_tier < e_tier:
        return True
    if c_tier > e_tier:
        return False
    return _filing_date_ord(candidate.get("filing_date")) > _filing_date_ord(existing.get("filing_date"))


def _report_date_ord(report_date: str | None) -> int:
    if not report_date:
        return 0
    try:
        return int(report_date.replace("-", ""))
    except ValueError:
        return 0


def _fp_slot(fp: str | None) -> int:
    if fp == "FY":
        return 5
    quarter = _fp_to_quarter(fp)
    if quarter is not None:
        return quarter
    return 0


def _period_slot(option: dict[str, Any]) -> int:
    """Within a fiscal year: annual after Q4…Q1 when sorting newest-first (slot 5 down to 1)."""
    fp_slot = _fp_slot(option.get("fp"))
    if fp_slot:
        return fp_slot
    if option.get("kind") == "annual":
        return 5
    quarter = _quarter_from_report_date(option.get("report_date") or option.get("period_end"))
    return quarter if quarter is not None else 0


def _sort_key_period(option: dict[str, Any]) -> tuple[int, int]:
    """Newest fiscal period first: FY26 Q1, FY25 10-K, FY25 Q4, …"""
    fy = option.get("fiscal_year") or 0
    return (-fy, -_period_slot(option))


def _is_20f_form(form: str) -> bool:
    return _compact_form_label(form) == "20-F"


def _period_option_id(kind: str, form: str, fiscal_year: int, report_date: str | None) -> str:
    if kind == "annual":
        if _is_20f_form(form):
            return f"annual-{fiscal_year}-20f"
        return f"annual-{fiscal_year}"
    return f"interim-{report_date}"


def _period_canonical_key(option: dict[str, Any]) -> str:
    """One dropdown row per fiscal period slot (not per period-end date variant)."""
    kind = option.get("kind")
    fy = option.get("fiscal_year")
    form = _compact_form_label(option.get("form") or "")
    if kind == "annual":
        if form == "20-F":
            return f"annual-{fy}-20f"
        return f"annual-{fy}"
    fp = option.get("fp")
    if not fp:
        quarter = _quarter_from_report_date(
            option.get("period_end") or option.get("report_date")
        )
        if quarter is not None:
            fp = f"Q{quarter}"
    if fp in ("Q1", "Q2", "Q3", "Q4"):
        return f"interim-{fy}-{fp}-{form}"
    end = option.get("period_end") or option.get("report_date")
    if end:
        return f"interim-{end}-{form}"
    return option["id"]


def _better_period_option(
    candidate: dict[str, Any], existing: dict[str, Any] | None
) -> bool:
    if existing is None:
        return True
    c_filed = _filing_date_ord(candidate.get("filing_date"))
    e_filed = _filing_date_ord(existing.get("filing_date"))
    if c_filed != e_filed:
        return c_filed > e_filed
    c_end = _report_date_ord(candidate.get("period_end") or candidate.get("report_date"))
    e_end = _report_date_ord(existing.get("period_end") or existing.get("report_date"))
    return c_end > e_end


def _dedupe_period_options(options: list[dict[str, Any]]) -> list[dict[str, Any]]:
    best: dict[str, dict[str, Any]] = {}
    for opt in options:
        key = _period_canonical_key(opt)
        if _better_period_option(opt, best.get(key)):
            best[key] = opt
    result = list(best.values())
    result.sort(key=_sort_key_period)
    return result


def _period_merge_key(option: dict[str, Any]) -> str:
    """Union key across tickers — keep distinct period-end ids per issuer."""
    return option["id"]


def _compact_form_label(form: str) -> str:
    return form.replace("/A", "")


def _fy_short(fiscal_year: int | None) -> str:
    if fiscal_year is None:
        return ""
    return f"{fiscal_year % 100:02d}" if fiscal_year >= 2000 else str(fiscal_year)


def _period_display_label(
    *,
    fiscal_year: int | None,
    fp: str | None,
    form: str,
    period_end: str | None,
    kind: str,
) -> str:
    """Dropdown label from XBRL tags: FY26 · Q1 · 10-Q, FY25 · 10-K, FY26 · 6-K · 2026-03-31."""
    short = _compact_form_label(form)
    fy = _fy_short(fiscal_year)
    if not fy:
        return short

    if kind == "annual" or fp == "FY":
        return f"FY{fy} · {short}"

    if fp in ("Q1", "Q2", "Q3", "Q4"):
        return f"FY{fy} · {fp} · {short}"

    if short == "6-K" and period_end:
        return f"FY{fy} · {short} · {period_end}"

    quarter = _quarter_from_report_date(period_end)
    if short == "10-Q" and quarter:
        return f"FY{fy} · Q{quarter} · {short}"

    if short == "10-Q" and period_end:
        return f"FY{fy} · {short} · {period_end}"

    return f"FY{fy} · {short}"


def _match_submission_filing(
    rows: list[dict[str, Any]],
    *,
    accn: str | None,
    end: str | None,
    form: str | None,
) -> dict[str, Any] | None:
    accn_norm = (accn or "").replace("-", "")
    compact_form = _compact_form_label(form or "")

    if accn_norm:
        for row in rows:
            if row.get("accession_no_dash") == accn_norm:
                return row

    if end:
        matches = [
            row
            for row in rows
            if row.get("report_date") == end
            and _compact_form_label(row.get("form", "")) == compact_form
        ]
        if matches:
            matches.sort(
                key=lambda x: (_form_tier(x["form"]), -_filing_date_ord(x.get("filing_date")))
            )
            return matches[0]

    return None


def _build_period_option(
    *,
    kind: str,
    fiscal_year: int,
    fp: str | None,
    form: str,
    period_end: str | None,
    filing_date: str | None,
) -> dict[str, Any]:
    option_id = _period_option_id(
        kind,
        form,
        fiscal_year if kind == "annual" else (int(period_end[:4]) if period_end else fiscal_year),
        period_end if kind == "interim" else period_end,
    )
    if kind == "interim" and not period_end:
        raise ValueError("interim period requires period_end")

    return {
        "id": option_id,
        "kind": kind,
        "fiscal_year": fiscal_year,
        "fp": fp,
        "period_end": period_end,
        "report_date": period_end,
        "form": form,
        "label": _period_display_label(
            fiscal_year=fiscal_year,
            fp=fp,
            form=form,
            period_end=period_end,
            kind=kind,
        ),
        "filing_date": filing_date,
    }


def _options_from_xbrl(
    xbrl_periods: list[dict[str, Any]],
    submission_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    annual_best: dict[tuple[int, str], dict[str, Any]] = {}
    interim_best: dict[tuple[Any, ...], dict[str, Any]] = {}

    for xp in xbrl_periods:
        filing = _match_submission_filing(
            submission_rows,
            accn=xp.get("accn"),
            end=xp.get("end"),
            form=xp.get("form"),
        )
        form = (filing or xp).get("form") or xp.get("form") or "10-K"
        kind = xp["kind"]
        fy = xp["fiscal_year"]
        end = xp.get("end")
        fp = xp.get("fp")
        filing_date = (filing or xp).get("filing_date") or xp.get("filed")

        option = _build_period_option(
            kind=kind,
            fiscal_year=fy,
            fp=fp,
            form=form,
            period_end=end,
            filing_date=filing_date,
        )

        if kind == "annual":
            key = (fy, _compact_form_label(form))
            existing = annual_best.get(key)
            if existing is None or _filing_date_ord(option.get("filing_date")) > _filing_date_ord(
                existing.get("filing_date")
            ):
                annual_best[key] = option
        elif end:
            if fp in ("Q1", "Q2", "Q3", "Q4"):
                key: tuple[Any, ...] = ("interim", fy, fp, _compact_form_label(form))
            else:
                key = ("interim", end)
            existing = interim_best.get(key)
            if existing is None or _filing_date_ord(option.get("filing_date")) > _filing_date_ord(
                existing.get("filing_date")
            ):
                interim_best[key] = option

    return _dedupe_period_options(list(annual_best.values()) + list(interim_best.values()))


def _six_k_options_from_submissions(
    submission_rows: list[dict[str, Any]],
    existing: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    covered_ends = {o.get("period_end") for o in existing if o.get("period_end")}
    interim_best: dict[str, dict[str, Any]] = {}

    for row in submission_rows:
        form = row["form"]
        if _compact_form_label(form) != "6-K":
            continue
        report_date = row.get("report_date")
        if not report_date or report_date in covered_ends:
            continue
        if _better_filing(row, interim_best.get(report_date)):
            interim_best[report_date] = row

    options: list[dict[str, Any]] = []
    for report_date, filing in interim_best.items():
        fy = int(report_date[:4])
        form = filing["form"]
        options.append(
            _build_period_option(
                kind="interim",
                fiscal_year=fy,
                fp=None,
                form=form,
                period_end=report_date,
                filing_date=filing.get("filing_date"),
            )
        )
    return options


def _options_from_submissions(submission_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Fallback period list when XBRL companyfacts is unavailable."""
    annual_best: dict[int, dict[str, Any]] = {}
    interim_best: dict[str, dict[str, Any]] = {}

    for row in submission_rows:
        form = row["form"]
        report_date = row.get("report_date")
        fiscal_year = row.get("fiscal_year")
        if form in ANNUAL_COMPARABLE_FORMS and fiscal_year is not None:
            if _better_filing(row, annual_best.get(fiscal_year)):
                annual_best[fiscal_year] = row
        elif form in INTERIM_COMPARABLE_FORMS and report_date:
            if _compact_form_label(form) == "6-K" or _better_filing(row, interim_best.get(report_date)):
                interim_best[report_date] = row

    options: list[dict[str, Any]] = []
    for year, filing in annual_best.items():
        form = filing["form"]
        end = filing.get("report_date")
        options.append(
            _build_period_option(
                kind="annual",
                fiscal_year=year,
                fp="FY",
                form=form,
                period_end=end,
                filing_date=filing.get("filing_date"),
            )
        )

    for report_date, filing in interim_best.items():
        fy = int(report_date[:4])
        form = filing["form"]
        quarter = _quarter_from_report_date(report_date)
        fp = f"Q{quarter}" if quarter else None
        options.append(
            _build_period_option(
                kind="interim",
                fiscal_year=fy,
                fp=fp,
                form=form,
                period_end=report_date,
                filing_date=filing.get("filing_date"),
            )
        )

    return _dedupe_period_options(options)


def list_comparable_filings(
    submissions: dict[str, Any],
    *,
    xbrl_periods: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Distinct annual and interim periods, newest reporting period first."""
    submission_rows = _iter_submission_filings(submissions)
    submission_options = _options_from_submissions(submission_rows)

    if xbrl_periods:
        xbrl_options = _options_from_xbrl(xbrl_periods, submission_rows)
        xbrl_options.extend(_six_k_options_from_submissions(submission_rows, xbrl_options))
        # Companyfacts often starts years after the issuer's first EDGAR filings; keep
        # the full submission history and prefer XBRL rows for overlapping period ids.
        merged: dict[str, dict[str, Any]] = {o["id"]: o for o in submission_options}
        for opt in xbrl_options:
            merged[opt["id"]] = opt
        return _dedupe_period_options(list(merged.values()))

    return submission_options


def merge_filing_periods(period_lists: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Union period options across tickers; newest reporting period first."""
    merged: dict[str, dict[str, Any]] = {}
    for periods in period_lists:
        for opt in periods:
            key = _period_merge_key(opt)
            if _better_period_option(opt, merged.get(key)):
                merged[key] = opt

    result = list(merged.values())
    result.sort(key=_sort_key_period)

    return result


def find_filing_for_period(
    submissions: dict[str, Any],
    period_filter: PeriodFilter | None,
    *,
    fiscal_year: int | None = None,
    period_id: str | None = None,
) -> dict[str, Any] | None:
    """Resolve a single filing for the given annual or interim period."""
    pf = period_filter or (
        PeriodFilter(kind="annual", fiscal_year=fiscal_year) if fiscal_year else None
    )
    if not pf:
        return None

    if pf.kind == "annual":
        year = pf.fiscal_year
        if year is None:
            return None
        annual_forms: tuple[str, ...] = ANNUAL_COMPARABLE_FORMS
        if period_id and period_id.lower().endswith("-20f"):
            annual_forms = ("20-F", "20-F/A")
        candidates = [
            row
            for row in _iter_submission_filings(submissions)
            if row["form"] in annual_forms and row.get("fiscal_year") == year
        ]
    else:
        report_date = pf.report_date
        if not report_date:
            return None
        candidates = [
            row
            for row in _iter_submission_filings(submissions)
            if row["form"] in INTERIM_COMPARABLE_FORMS and row.get("report_date") == report_date
        ]

    if not candidates:
        return None
    candidates.sort(key=lambda x: (_form_tier(x["form"]), -_filing_date_ord(x.get("filing_date"))))
    return candidates[0]
