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

# Domestic + foreign issuer forms supported for side-by-side compare.
ANNUAL_COMPARABLE_FORMS: tuple[str, ...] = ("10-K", "10-K/A", "20-F", "20-F/A")
INTERIM_COMPARABLE_FORMS: tuple[str, ...] = ("10-Q", "10-Q/A", "6-K")
COMPARABLE_FORM_TYPES: list[str] = list(ANNUAL_COMPARABLE_FORMS) + list(INTERIM_COMPARABLE_FORMS)

_next_request_time = 0.0
_request_lock = asyncio.Lock()
MIN_INTERVAL = 0.11  # ~9 req/sec to stay under SEC 10 req/sec limit

_ticker_map_cache: dict[str, dict[str, Any]] | None = None
_ticker_map_cached_at = 0.0
TICKER_MAP_TTL = 3600.0  # 1 hour
_ticker_map_inflight: asyncio.Task[dict[str, dict[str, Any]]] | None = None

_submissions_inflight: dict[str, asyncio.Task[dict[str, Any]]] = {}
_filing_html_inflight: dict[tuple[str, str], asyncio.Task[bytes]] = {}

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
    global _next_request_time
    headers = _data_headers() if data_api else None

    # Reserve the next SEC request slot while holding the scheduler lock.
    async with _request_lock:
        now = time.monotonic()
        send_at = _next_request_time if _next_request_time > now else now
        _next_request_time = send_at + MIN_INTERVAL

    wait_for = send_at - time.monotonic()
    if wait_for > 0:
        await asyncio.sleep(wait_for)

    return await client.get(url, headers=headers)


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
    global _ticker_map_cache, _ticker_map_cached_at, _ticker_map_inflight
    now = time.monotonic()
    if _ticker_map_cache and (now - _ticker_map_cached_at) < TICKER_MAP_TTL:
        return _ticker_map_cache

    if _ticker_map_inflight is not None:
        return await _ticker_map_inflight

    async def _load() -> dict[str, dict[str, Any]]:
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
        return result

    _ticker_map_inflight = asyncio.create_task(_load())
    try:
        result = await _ticker_map_inflight
        _ticker_map_cache = result
        _ticker_map_cached_at = time.monotonic()
        return result
    finally:
        _ticker_map_inflight = None


async def resolve_ticker(ticker: str, ticker_map: dict | None = None) -> dict[str, Any]:
    ticker = ticker.upper().strip()
    if not ticker_map:
        ticker_map = await fetch_ticker_map()
    if ticker not in ticker_map:
        raise ValueError(f"Unknown ticker: {ticker}")
    info = ticker_map[ticker]
    return {"ticker": ticker, "cik": info["cik"], "company_name": info["title"]}


async def _merge_submission_archives(data: dict[str, Any]) -> None:
    """Append older filing rows from SEC archive JSON files (beyond the 1000-row recent window)."""
    filings = data.get("filings", {})
    if filings.get("_archives_merged"):
        return

    archive_files = filings.get("files") or []
    recent = filings.setdefault("recent", {})
    if not archive_files:
        filings["_archives_merged"] = True
        return

    keys = ("form", "accessionNumber", "filingDate", "reportDate", "primaryDocument")
    client = await get_http_client()
    for info in archive_files:
        name = info.get("name")
        if not name:
            continue
        url = f"https://data.sec.gov/submissions/{name}"
        resp = await _rate_limited_get(client, url, data_api=True)
        resp.raise_for_status()
        chunk = resp.json()
        for key in keys:
            values = chunk.get(key)
            if values:
                recent.setdefault(key, [])
                recent[key].extend(values)

    filings["_archives_merged"] = True


async def fetch_submissions(cik: str) -> dict[str, Any]:
    from filing_store import load_submissions, save_submissions

    cached = load_submissions(cik)
    if cached and cached.get("filings", {}).get("_archives_merged"):
        return cached

    in_flight = _submissions_inflight.get(cik)
    if in_flight is not None:
        return await in_flight

    async def _load() -> dict[str, Any]:
        if cached:
            data = cached
        else:
            cik_padded = str(int(cik)).zfill(10)
            url = SUBMISSIONS_URL.format(cik=cik_padded)
            client = await get_http_client()
            resp = await _rate_limited_get(client, url, data_api=True)
            resp.raise_for_status()
            data = resp.json()
        await _merge_submission_archives(data)
        save_submissions(cik, data)
        return data

    task = asyncio.create_task(_load())
    _submissions_inflight[cik] = task
    try:
        return await task
    finally:
        _submissions_inflight.pop(cik, None)


def _form_tier(form: str) -> int:
    if form in ("10-K", "20-F"):
        return 0
    if form in ("10-K/A", "20-F/A"):
        return 1
    if form in ("10-Q", "6-K"):
        return 2
    if form in ("10-Q/A",):
        return 3
    return 4


def _filing_date_ord(filing_date: str | None) -> int:
    if not filing_date:
        return 0
    try:
        return int(filing_date.replace("-", ""))
    except ValueError:
        return 0


def find_filing(
    submissions: dict[str, Any],
    form_types: list[str] | None = None,
    fiscal_year: int | None = None,
    *,
    period: str | None = None,
) -> dict[str, Any] | None:
    from sec.filing_periods import find_filing_for_period, resolve_period_filter

    if period:
        period_filter = resolve_period_filter(fiscal_year, period)
        if period_filter:
            return find_filing_for_period(submissions, period_filter, period_id=period)
        return None

    form_types = form_types or COMPARABLE_FORM_TYPES
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
    if fiscal_year is None:
        candidates.sort(key=lambda x: -_filing_date_ord(x.get("filing_date")))
    else:
        candidates.sort(
            key=lambda x: (_form_tier(x["form"]), -_filing_date_ord(x.get("filing_date")))
        )
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

    key = (cik, accession)
    in_flight = _filing_html_inflight.get(key)
    if in_flight is not None:
        return await in_flight

    async def _load() -> bytes:
        url = build_filing_url(cik, accession, filing.get("primary_document"))
        client = await get_http_client()
        resp = await _rate_limited_get(client, url)
        resp.raise_for_status()
        html_bytes = await resp.aread()
        save_filing_html(cik, accession, html_bytes)
        return html_bytes

    task = asyncio.create_task(_load())
    _filing_html_inflight[key] = task
    try:
        return await task
    finally:
        _filing_html_inflight.pop(key, None)
