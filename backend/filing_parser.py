"""SEC filing parsing with persistent disk cache and lazy section HTML."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from parse_cache import (
    find_cache_key,
    find_section_html,
    get_filing_structure,
    load_parsed_column,
    make_cache_key,
    store_filing_structure,
    store_parsed_column,
    store_section_html,
)
from sec.client import (
    build_filing_url,
    fetch_filing_html,
    fetch_submissions,
    fetch_ticker_map,
    find_filing,
    resolve_ticker,
)
from sec.section_extractor import (
    _prepare_filing_structure,
    _sections_from_structure,
    extract_section_html,
    extract_section_text,
    get_section_catalog,
)


class ParseRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=1, max_length=8)
    fiscal_year: int | None = None
    period: str | None = None


class ColumnResult(BaseModel):
    ticker: str
    company_name: str
    cik: str
    form: str | None = None
    filing_date: str | None = None
    report_date: str | None = None
    fiscal_year: int | None = None
    primary_document: str | None = None
    filing_url: str | None = None
    sections: list[dict[str, Any]] = []
    error: str | None = None
    cache_key: str | None = None
    from_cache: bool = False


class ParseResponse(BaseModel):
    columns: list[ColumnResult]
    section_catalog: list[dict[str, str]]
    parsed_at: str
    stateless: bool = False


class SectionHtmlResponse(BaseModel):
    ticker: str
    section_id: str
    html: str = ""
    text: str = ""
    cache_key: str | None = None


def _sections_for_response(sections: list[dict[str, Any]], *, include_html: bool = False) -> list[dict[str, Any]]:
    return [
        {
            "id": s["id"],
            "label": s["label"],
            "heading": s.get("heading", ""),
            **({"anchor": s["anchor"]} if s.get("anchor") else {}),
            **({"html": s.get("html", "")} if include_html else {}),
            "text_preview": s.get("text_preview", ""),
        }
        for s in sections
    ]


def _build_column_result(
    column: ColumnResult,
    sections: list[dict[str, Any]],
    cache_key: str,
    *,
    from_cache: bool,
    include_html: bool = True,
) -> ColumnResult:
    col_dict = column.model_dump()
    has_inline_html = any(s.get("html") for s in sections)
    col_dict["sections"] = _sections_for_response(sections, include_html=has_inline_html)
    col_dict["cache_key"] = cache_key
    col_dict["from_cache"] = from_cache
    col_dict["filing_url"] = _resolve_filing_url(
        col_dict.get("cik", ""),
        cache_key,
        primary_document=col_dict.get("primary_document"),
        filing_url=col_dict.get("filing_url"),
    )
    if not from_cache:
        store_parsed_column(cache_key, {k: v for k, v in col_dict.items() if k != "sections"}, sections)
    return ColumnResult(**col_dict)


async def _parse_single_ticker(
    ticker: str,
    ticker_map: dict[str, dict[str, Any]],
    requested_year: int | None,
    period: str | None = None,
    interim_slot: tuple[int, str, str] | None = None,
) -> tuple[ColumnResult, list[dict[str, Any]], str | None, bool]:
    ticker = ticker.upper().strip()
    try:
        resolved = await resolve_ticker(ticker, ticker_map)
        submissions = await fetch_submissions(resolved["cik"])

        xbrl_periods = None
        if period:
            try:
                from sec.xbrl_client import fetch_company_facts, list_reporting_periods

                facts, _ = await fetch_company_facts(resolved["cik"])
                xbrl_periods = list_reporting_periods(facts)
            except Exception:
                xbrl_periods = None

        if period:
            filing = find_filing(
                submissions,
                period=period,
                interim_slot=interim_slot,
                xbrl_periods=xbrl_periods,
            )
        elif requested_year is not None:
            filing = find_filing(submissions, fiscal_year=requested_year)
        else:
            filing = find_filing(submissions, fiscal_year=None)

        if not filing:
            label = period or (str(requested_year) if requested_year is not None else "latest")
            column = ColumnResult(
                ticker=ticker,
                company_name=resolved["company_name"],
                cik=resolved["cik"],
                error=f"No comparable filing (10-K, 10-Q, 20-F, or 6-K) found for period {label}",
            )
            return column, [], None, False

        accession = filing.get("accession_no_dash", "")
        fiscal_year = filing.get("fiscal_year")
        cache_key = make_cache_key(ticker, fiscal_year, accession)

        primary_document = filing.get("primary_document")
        filing_url = build_filing_url(resolved["cik"], accession, primary_document)

        cached = load_parsed_column(cache_key)
        if cached:
            col_meta, sections = cached
            cik = col_meta.get("cik", resolved["cik"])
            primary = col_meta.get("primary_document", primary_document)
            column = ColumnResult(
                ticker=col_meta.get("ticker", ticker),
                company_name=col_meta.get("company_name", resolved["company_name"]),
                cik=cik,
                form=col_meta.get("form") or filing.get("form"),
                filing_date=col_meta.get("filing_date", filing.get("filing_date")),
                report_date=col_meta.get("report_date", filing.get("report_date")),
                fiscal_year=col_meta.get("fiscal_year", fiscal_year),
                primary_document=primary,
                filing_url=_resolve_filing_url(
                    cik, cache_key, primary_document=primary, filing_url=col_meta.get("filing_url")
                ),
                sections=sections,
            )
            return column, sections, cache_key, True

        html_bytes = await fetch_filing_html(resolved["cik"], filing)

        def _build_section_index() -> tuple[list[dict[str, Any]], dict[str, Any]]:
            structure = _prepare_filing_structure(html_bytes)
            sections = _sections_from_structure(structure, include_html=False)
            return sections, structure

        sections, structure = await asyncio.to_thread(_build_section_index)
        store_filing_structure(cache_key, structure)
        del html_bytes

        column = ColumnResult(
            ticker=ticker,
            company_name=resolved["company_name"],
            cik=resolved["cik"],
            form=filing.get("form"),
            filing_date=filing.get("filing_date"),
            report_date=filing.get("report_date"),
            fiscal_year=fiscal_year,
            primary_document=primary_document,
            filing_url=filing_url,
            sections=sections,
        )
        return column, sections, cache_key, False
    except Exception as exc:
        column = ColumnResult(
            ticker=ticker,
            company_name=ticker,
            cik="",
            error=str(exc),
        )
        return column, [], None, False


async def parse_filings(request: ParseRequest) -> ParseResponse:
    from sec.filing_periods import resolve_interim_slot_for_tickers

    ticker_map = await fetch_ticker_map()
    interim_slot = await resolve_interim_slot_for_tickers(
        request.tickers, request.period, ticker_map
    )

    raw_results = await asyncio.gather(
        *[
            _parse_single_ticker(
                ticker, ticker_map, request.fiscal_year, request.period, interim_slot
            )
            for ticker in request.tickers
        ]
    )

    columns: list[ColumnResult] = []
    for column, sections_full, cache_key, from_cache in raw_results:
        if cache_key and sections_full:
            columns.append(_build_column_result(column, sections_full, cache_key, from_cache=from_cache))
        else:
            columns.append(column)

    return ParseResponse(
        columns=columns,
        section_catalog=get_section_catalog(),
        parsed_at=datetime.utcnow().isoformat() + "Z",
    )


async def parse_filings_stream(request: ParseRequest) -> AsyncIterator[str]:
    parsed_at = datetime.utcnow().isoformat() + "Z"

    yield json.dumps(
        {
            "type": "catalog",
            "section_catalog": get_section_catalog(),
            "parsed_at": parsed_at,
        }
    ) + "\n"

    ticker_map = await fetch_ticker_map()
    from sec.filing_periods import resolve_interim_slot_for_tickers

    interim_slot = await resolve_interim_slot_for_tickers(
        request.tickers, request.period, ticker_map
    )

    tasks = {
        asyncio.create_task(
            _parse_single_ticker(
                ticker, ticker_map, request.fiscal_year, request.period, interim_slot
            )
        ): ticker
        for ticker in request.tickers
    }

    for task in asyncio.as_completed(tasks):
        column, sections_full, cache_key, from_cache = await task
        if cache_key and sections_full:
            payload = _build_column_result(
                column, sections_full, cache_key, from_cache=from_cache, include_html=False
            )
        else:
            payload = column
        yield json.dumps({"type": "column", "column": payload.model_dump()}) + "\n"

    yield json.dumps({"type": "done", "parsed_at": parsed_at}) + "\n"


async def list_periods_for_tickers(tickers: list[str]) -> list[dict[str, Any]]:
    from sec.filing_periods import list_comparable_filings, merge_filing_periods
    from sec.xbrl_client import fetch_company_facts, list_reporting_periods

    ticker_map = await fetch_ticker_map()
    period_lists: list[list[dict[str, Any]]] = []
    for raw in tickers:
        ticker = raw.upper().strip()
        if not ticker:
            continue
        resolved = await resolve_ticker(ticker, ticker_map)
        submissions = await fetch_submissions(resolved["cik"])
        xbrl_periods: list[dict[str, Any]] | None = None
        try:
            facts, _ = await fetch_company_facts(resolved["cik"])
            xbrl_periods = list_reporting_periods(facts)
        except Exception:
            xbrl_periods = None
        period_lists.append(list_comparable_filings(submissions, xbrl_periods=xbrl_periods))
    return merge_filing_periods(period_lists)


async def get_section_html(
    ticker: str,
    section_id: str,
    fiscal_year: int | None,
    *,
    content_format: str = "html",
) -> SectionHtmlResponse:
    ticker = ticker.upper().strip()
    want_html = content_format != "text"
    want_text = content_format == "text"

    html: str | None = None
    text: str | None = None
    cache_key = find_cache_key(ticker, fiscal_year)

    if want_html:
        html = find_section_html(ticker, section_id, fiscal_year)

    if (want_html and html is None) or want_text:
        extracted_html, extracted_text, cache_key = await _extract_and_cache_section(
            ticker, section_id, fiscal_year, cache_key, want_html=want_html, want_text=want_text
        )
        if html is None:
            html = extracted_html
        text = extracted_text

    if want_html and not html:
        raise ValueError(f"Section '{section_id}' not found for ticker {ticker}")
    if want_text and not text:
        raise ValueError(f"Section '{section_id}' not found for ticker {ticker}")

    return SectionHtmlResponse(
        ticker=ticker,
        section_id=section_id,
        html=html or "",
        text=text or "",
        cache_key=cache_key,
    )


def _accession_from_cache_key(cache_key: str) -> str:
    parts = cache_key.split(":", 2)
    return parts[2] if len(parts) >= 3 else ""


def _resolve_filing_url(
    cik: str,
    cache_key: str | None,
    *,
    primary_document: str | None = None,
    filing_url: str | None = None,
) -> str | None:
    if filing_url:
        return filing_url
    if not cik or not cache_key:
        return None
    accession = _accession_from_cache_key(cache_key)
    if not accession:
        return None
    return build_filing_url(cik, accession, primary_document)


async def _extract_and_cache_section(
    ticker: str,
    section_id: str,
    fiscal_year: int | None,
    cache_key: str | None,
    *,
    want_html: bool = True,
    want_text: bool = False,
) -> tuple[str | None, str | None, str | None]:
    """Load filing HTML and extract one section; ensure index exists in cache."""
    column_meta: dict[str, Any] | None = None
    if cache_key:
        cached = load_parsed_column(cache_key)
        if cached:
            column_meta, _ = cached

    if column_meta is None:
        ticker_map = await fetch_ticker_map()
        column, sections, new_key, _from_cache = await _parse_single_ticker(
            ticker, ticker_map, fiscal_year, None
        )
        if not new_key or not sections:
            return None, None, None
        cache_key = new_key
        column_meta = column.model_dump()
        if column.error:
            return None, None, cache_key

    cik = column_meta.get("cik", "")
    accession = _accession_from_cache_key(cache_key or "")
    if not cik or not accession:
        return None, None, cache_key

    from filing_store import load_filing_html

    html_bytes = load_filing_html(cik, accession)
    if not html_bytes:
        ticker_map = await fetch_ticker_map()
        resolved = await resolve_ticker(ticker, ticker_map)
        submissions = await fetch_submissions(resolved["cik"])
        filing = find_filing(submissions, fiscal_year=fiscal_year or column_meta.get("fiscal_year"))
        if not filing:
            return None, None, cache_key
        html_bytes = await fetch_filing_html(resolved["cik"], filing)

    structure = get_filing_structure(cache_key) if cache_key else None
    if structure is None:
        structure = await asyncio.to_thread(_prepare_filing_structure, html_bytes)
        if cache_key:
            store_filing_structure(cache_key, structure)

    html: str | None = None
    text: str | None = None

    if want_html:
        html = await asyncio.to_thread(extract_section_html, html_bytes, section_id, structure)
        if html and cache_key:
            store_section_html(cache_key, section_id, html)

    if want_text:
        text = await asyncio.to_thread(extract_section_text, html_bytes, section_id, structure)

    return html, text, cache_key
