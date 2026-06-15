"""SEC filing parsing with persistent disk cache and full section payloads."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from parse_cache import find_section_html, load_parsed_column, make_cache_key, store_parsed_column
from sec.client import (
    fetch_filing_html,
    fetch_submissions,
    fetch_ticker_map,
    find_filing,
    resolve_ticker,
)
from sec.section_extractor import get_section_catalog, parse_filing_sections


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


def _sections_for_response(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "id": s["id"],
            "label": s["label"],
            "heading": s.get("heading", ""),
            "html": s.get("html", ""),
            "text_preview": s.get("text_preview", ""),
        }
        for s in sections
    ]


def _build_column_result(
    column: ColumnResult,
    sections_full: list[dict[str, Any]],
    cache_key: str,
    *,
    from_cache: bool,
) -> ColumnResult:
    col_dict = column.model_dump()
    col_dict["sections"] = _sections_for_response(sections_full)
    col_dict["cache_key"] = cache_key
    col_dict["from_cache"] = from_cache
    if not from_cache:
        store_parsed_column(cache_key, {k: v for k, v in col_dict.items() if k != "sections"}, sections_full)
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
        parsed = await asyncio.to_thread(parse_filing_sections, html_bytes)
        del html_bytes

        column = ColumnResult(
            ticker=ticker,
            company_name=resolved["company_name"],
            cik=resolved["cik"],
            form=filing.get("form"),
            filing_date=filing.get("filing_date"),
            report_date=filing.get("report_date"),
            fiscal_year=fiscal_year,
            sections=parsed["sections"],
        )
        return column, parsed["sections"], cache_key, False
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
            payload = _build_column_result(column, sections_full, cache_key, from_cache=from_cache)
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

    if html is None:
        request = ParseRequest(tickers=[ticker], fiscal_year=fiscal_year)
        await parse_filings(request)
        html = find_section_html(ticker, section_id, fiscal_year)

    if html is None:
        raise ValueError(f"Section '{section_id}' not found for ticker {ticker}")

    return SectionHtmlResponse(ticker=ticker, section_id=section_id, html=html)
