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
    get_section_catalog,
)


class ParseRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=1, max_length=8)
    fiscal_year: int | None = None


class ColumnResult(BaseModel):
    ticker: str
    company_name: str
    cik: str
    form: str | None = None
    filing_date: str | None = None
    report_date: str | None = None
    fiscal_year: int | None = None
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
    html: str
    cache_key: str | None = None


def _sections_for_response(sections: list[dict[str, Any]], *, include_html: bool = False) -> list[dict[str, Any]]:
    return [
        {
            "id": s["id"],
            "label": s["label"],
            "heading": s.get("heading", ""),
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
    if not from_cache:
        store_parsed_column(cache_key, {k: v for k, v in col_dict.items() if k != "sections"}, sections)
    return ColumnResult(**col_dict)


async def _parse_single_ticker(
    ticker: str,
    ticker_map: dict[str, dict[str, Any]],
    target_year: int,
    requested_year: int | None,
) -> tuple[ColumnResult, list[dict[str, Any]], str | None, bool]:
    ticker = ticker.upper().strip()
    try:
        resolved = await resolve_ticker(ticker, ticker_map)
        submissions = await fetch_submissions(resolved["cik"])
        filing = find_filing(submissions, fiscal_year=target_year)

        if not filing and requested_year is None:
            filing = find_filing(submissions, fiscal_year=None)

        if not filing:
            column = ColumnResult(
                ticker=ticker,
                company_name=resolved["company_name"],
                cik=resolved["cik"],
                error=f"No 10-K/10-Q filing found for fiscal year {target_year}",
            )
            return column, [], None, False

        accession = filing.get("accession_no_dash", "")
        fiscal_year = filing.get("fiscal_year")
        cache_key = make_cache_key(ticker, fiscal_year, accession)

        cached = load_parsed_column(cache_key)
        if cached:
            col_meta, sections = cached
            column = ColumnResult(
                ticker=col_meta.get("ticker", ticker),
                company_name=col_meta.get("company_name", resolved["company_name"]),
                cik=col_meta.get("cik", resolved["cik"]),
                form=col_meta.get("form", filing.get("form")),
                filing_date=col_meta.get("filing_date", filing.get("filing_date")),
                report_date=col_meta.get("report_date", filing.get("report_date")),
                fiscal_year=col_meta.get("fiscal_year", fiscal_year),
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
    target_year = request.fiscal_year or datetime.now().year
    ticker_map = await fetch_ticker_map()

    raw_results = await asyncio.gather(
        *[
            _parse_single_ticker(ticker, ticker_map, target_year, request.fiscal_year)
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
    target_year = request.fiscal_year or datetime.now().year
    ticker_map = await fetch_ticker_map()
    parsed_at = datetime.utcnow().isoformat() + "Z"

    yield json.dumps(
        {
            "type": "catalog",
            "section_catalog": get_section_catalog(),
            "parsed_at": parsed_at,
        }
    ) + "\n"

    tasks = {
        asyncio.create_task(
            _parse_single_ticker(ticker, ticker_map, target_year, request.fiscal_year)
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


async def get_section_html(
    ticker: str,
    section_id: str,
    fiscal_year: int | None,
) -> SectionHtmlResponse:
    ticker = ticker.upper().strip()
    html = find_section_html(ticker, section_id, fiscal_year)
    cache_key = find_cache_key(ticker, fiscal_year)

    if html is None:
        html, cache_key = await _extract_and_cache_section(ticker, section_id, fiscal_year, cache_key)

    if html is None:
        raise ValueError(f"Section '{section_id}' not found for ticker {ticker}")

    return SectionHtmlResponse(ticker=ticker, section_id=section_id, html=html, cache_key=cache_key)


def _accession_from_cache_key(cache_key: str) -> str:
    parts = cache_key.split(":", 2)
    return parts[2] if len(parts) >= 3 else ""


async def _extract_and_cache_section(
    ticker: str,
    section_id: str,
    fiscal_year: int | None,
    cache_key: str | None,
) -> tuple[str | None, str | None]:
    """Load filing HTML and extract one section; ensure index exists in cache."""
    column_meta: dict[str, Any] | None = None
    if cache_key:
        cached = load_parsed_column(cache_key)
        if cached:
            column_meta, _ = cached

    if column_meta is None:
        target_year = fiscal_year or datetime.now().year
        ticker_map = await fetch_ticker_map()
        column, sections, new_key, _from_cache = await _parse_single_ticker(
            ticker, ticker_map, target_year, fiscal_year
        )
        if not new_key or not sections:
            return None, None
        cache_key = new_key
        column_meta = column.model_dump()
        if column.error:
            return None, cache_key

    cik = column_meta.get("cik", "")
    accession = _accession_from_cache_key(cache_key or "")
    if not cik or not accession:
        return None, cache_key

    from filing_store import load_filing_html

    html_bytes = load_filing_html(cik, accession)
    if not html_bytes:
        ticker_map = await fetch_ticker_map()
        resolved = await resolve_ticker(ticker, ticker_map)
        submissions = await fetch_submissions(resolved["cik"])
        filing = find_filing(submissions, fiscal_year=fiscal_year or column_meta.get("fiscal_year"))
        if not filing:
            return None, cache_key
        html_bytes = await fetch_filing_html(resolved["cik"], filing)

    structure = get_filing_structure(cache_key) if cache_key else None
    if structure is None:
        structure = await asyncio.to_thread(_prepare_filing_structure, html_bytes)
        if cache_key:
            store_filing_structure(cache_key, structure)

    html = await asyncio.to_thread(extract_section_html, html_bytes, section_id, structure)
    if html and cache_key:
        store_section_html(cache_key, section_id, html)
    return html, cache_key
