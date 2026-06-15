"""SEC EDGAR client with mandatory User-Agent and rate limiting."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from config import get_settings

settings = get_settings()

TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data"

_last_request_time = 0.0
_request_lock = asyncio.Lock()
MIN_INTERVAL = 0.11  # ~9 req/sec to stay under SEC 10 req/sec limit

_ticker_map_cache: dict[str, dict[str, Any]] | None = None
_ticker_map_cached_at = 0.0
TICKER_MAP_TTL = 3600.0  # 1 hour

_http_client: httpx.AsyncClient | None = None


async def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(120.0, connect=15.0),
            headers=_headers(),
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )
    return _http_client


async def close_http_client() -> None:
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()
    _http_client = None


async def _rate_limited_get(client: httpx.AsyncClient, url: str, *, data_api: bool = False) -> httpx.Response:
    global _last_request_time
    headers = _data_headers() if data_api else None
    async with _request_lock:
        elapsed = time.monotonic() - _last_request_time
        if elapsed < MIN_INTERVAL:
            await asyncio.sleep(MIN_INTERVAL - elapsed)
        response = await client.get(url, headers=headers)
        _last_request_time = time.monotonic()
        return response


def _headers() -> dict[str, str]:
    return {
        "User-Agent": settings.sec_user_agent,
        "Accept-Encoding": "gzip, deflate",
    }


def _data_headers() -> dict[str, str]:
    return {
        "User-Agent": settings.sec_user_agent,
        "Accept-Encoding": "gzip, deflate",
    }


async def fetch_ticker_map() -> dict[str, dict[str, Any]]:
    global _ticker_map_cache, _ticker_map_cached_at
    now = time.monotonic()
    if _ticker_map_cache and (now - _ticker_map_cached_at) < TICKER_MAP_TTL:
        return _ticker_map_cache

    client = await get_http_client()
    resp = await _rate_limited_get(client, TICKERS_URL)
    resp.raise_for_status()
    raw = resp.json()
    result: dict[str, dict[str, Any]] = {}
    for entry in raw.values():
        ticker = str(entry.get("ticker", "")).upper()
        if ticker:
            result[ticker] = {
                "cik": str(entry["cik_str"]).zfill(10),
                "title": entry.get("title", ticker),
            }
    _ticker_map_cache = result
    _ticker_map_cached_at = now
    return result


async def resolve_ticker(ticker: str, ticker_map: dict | None = None) -> dict[str, Any]:
    ticker = ticker.upper().strip()
    if not ticker_map:
        ticker_map = await fetch_ticker_map()
    if ticker not in ticker_map:
        raise ValueError(f"Unknown ticker: {ticker}")
    info = ticker_map[ticker]
    return {"ticker": ticker, "cik": info["cik"], "company_name": info["title"]}


async def fetch_submissions(cik: str) -> dict[str, Any]:
    from filing_store import load_submissions, save_submissions

    cached = load_submissions(cik)
    if cached:
        return cached

    cik_padded = str(int(cik)).zfill(10)
    url = SUBMISSIONS_URL.format(cik=cik_padded)
    client = await get_http_client()
    resp = await _rate_limited_get(client, url, data_api=True)
    resp.raise_for_status()
    data = resp.json()
    save_submissions(cik, data)
    return data


def find_filing(
    submissions: dict[str, Any],
    form_types: list[str] | None = None,
    fiscal_year: int | None = None,
) -> dict[str, Any] | None:
    form_types = form_types or ["10-K", "10-Q"]
    recent = submissions.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    filing_dates = recent.get("filingDate", [])
    primary_docs = recent.get("primaryDocument", [])
    report_dates = recent.get("reportDate", [])

    candidates = []
    for i, form in enumerate(forms):
        if form not in form_types:
            continue
        accession = accessions[i] if i < len(accessions) else None
        if not accession:
            continue
        report_date = report_dates[i] if i < len(report_dates) else filing_dates[i]
        year = int(report_date[:4]) if report_date else None
        if fiscal_year and year != fiscal_year:
            continue
        candidates.append(
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

    if not candidates:
        return None
    candidates.sort(key=lambda x: x.get("filing_date") or "", reverse=True)
    return candidates[0]


def build_filing_url(
    cik: str,
    accession_no_dash: str,
    primary_document: str | None = None,
) -> str:
    """Official SEC EDGAR URL for the filing's primary document."""
    cik_int = str(int(cik))
    primary = primary_document or f"{accession_no_dash}.htm"
    return f"{ARCHIVES_BASE}/{cik_int}/{accession_no_dash}/{primary}"


async def fetch_filing_html(cik: str, filing: dict[str, Any]) -> bytes:
    from filing_store import load_filing_html, save_filing_html

    accession = filing["accession_no_dash"]
    cached = load_filing_html(cik, accession)
    if cached:
        return cached

    url = build_filing_url(cik, accession, filing.get("primary_document"))

    client = await get_http_client()
    resp = await _rate_limited_get(client, url)
    resp.raise_for_status()
    html_bytes = await resp.aread()
    save_filing_html(cik, accession, html_bytes)
    return html_bytes
