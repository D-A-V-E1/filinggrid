"""Stateless SEC filing parsing pipeline — all processing in RAM."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

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


class ParseResponse(BaseModel):
    columns: list[ColumnResult]
    section_catalog: list[dict[str, str]]
    parsed_at: str
    stateless: bool = True


async def parse_filings(request: ParseRequest) -> ParseResponse:
    """
    Accept multiple tickers, fetch 10-K/10-Q filings, parse sections in memory.
    No file.save() — all data discarded after response serialization.
    """
    target_year = request.fiscal_year or datetime.now().year
    ticker_map = await fetch_ticker_map()
    columns: list[ColumnResult] = []

    for ticker in request.tickers:
        ticker = ticker.upper().strip()
        try:
            resolved = await resolve_ticker(ticker, ticker_map)
            submissions = await fetch_submissions(resolved["cik"])
            filing = find_filing(submissions, fiscal_year=target_year)

            if not filing and request.fiscal_year is None:
                filing = find_filing(submissions, fiscal_year=None)

            if not filing:
                columns.append(
                    ColumnResult(
                        ticker=ticker,
                        company_name=resolved["company_name"],
                        cik=resolved["cik"],
                        error=f"No 10-K/10-Q filing found for fiscal year {target_year}",
                    )
                )
                continue

            html_bytes = await fetch_filing_html(resolved["cik"], filing)
            parsed = parse_filing_sections(html_bytes)
            del html_bytes

            columns.append(
                ColumnResult(
                    ticker=ticker,
                    company_name=resolved["company_name"],
                    cik=resolved["cik"],
                    form=filing.get("form"),
                    filing_date=filing.get("filing_date"),
                    report_date=filing.get("report_date"),
                    fiscal_year=filing.get("fiscal_year"),
                    sections=parsed["sections"],
                )
            )
        except Exception as exc:
            columns.append(
                ColumnResult(
                    ticker=ticker,
                    company_name=ticker,
                    cik="",
                    error=str(exc),
                )
            )

    return ParseResponse(
        columns=columns,
        section_catalog=get_section_catalog(),
        parsed_at=datetime.utcnow().isoformat() + "Z",
    )
