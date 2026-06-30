"""SEC EDGAR client with mandatory User-Agent and rate limiting."""

from __future__ import annotations

import asyncio
import re
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

# Company-name tokens sometimes sent instead of SEC symbols (e.g. TESLA → TSLA).
TICKER_ALIASES: dict[str, str] = {
    "TESLA": "TSLA",
    "GOOGLE": "GOOGL",
    "ALPHABET": "GOOGL",
    "FACEBOOK": "META",
    "AMAZON": "AMZN",
    "APPLE": "AAPL",
    "MICROSOFT": "MSFT",
    "NVIDIA": "NVDA",
    "INTEL": "INTC",
    "FORD": "F",
    "CHEVRON": "CVX",
    "EXXON": "XOM",
    "DISNEY": "DIS",
    "WALMART": "WMT",
    "BERKSHIRE": "BRK-B",
    "COCACOLA": "KO",
    "COCA-COLA": "KO",
    "PEPSI": "PEP",
    "PEPSICO": "PEP",
    "NETFLIX": "NFLX",
    "SALESFORCE": "CRM",
    "SERVICENOW": "NOW",
    "SHOPIFY": "SHOP",
}

_next_request_time = 0.0
_request_locks: dict[int, asyncio.Lock] = {}
MIN_INTERVAL = 0.11  # ~9 req/sec to stay under SEC 10 req/sec limit

_ticker_map_cache: dict[str, dict[str, Any]] | None = None
_ticker_map_cached_at = 0.0
TICKER_MAP_TTL = 3600.0  # 1 hour
_ticker_map_inflight: asyncio.Task[dict[str, dict[str, Any]]] | None = None

_submissions_inflight: dict[str, asyncio.Task[dict[str, Any]]] = {}
_filing_html_inflight: dict[tuple[str, str], asyncio.Task[bytes]] = {}
_filing_ixbrl_inflight: dict[tuple[str, str], asyncio.Task[bytes]] = {}

_IX_NONFRACTION_PROBE = re.compile(r"<ix:nonFraction\b", re.I)
_IXBRL_DOC_KEYWORDS: tuple[str, ...] = (
    "consolidated",
    "financial",
    "ex99",
    "ex-99",
    "report",
    "statements",
    "earnings",
)

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


def _get_request_lock() -> asyncio.Lock:
    loop = asyncio.get_running_loop()
    key = id(loop)
    lock = _request_locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _request_locks[key] = lock
    return lock


async def _rate_limited_get(client: httpx.AsyncClient, url: str, *, data_api: bool = False) -> httpx.Response:
    global _next_request_time
    headers = _data_headers() if data_api else None

    # Reserve the next SEC request slot while holding the scheduler lock.
    async with _get_request_lock():
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
    ticker = TICKER_ALIASES.get(ticker, ticker)
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


async def fetch_submissions(cik: str, *, merge_archives: bool = False) -> dict[str, Any]:
    from filing_store import load_submissions, save_submissions

    cached = load_submissions(cik)
    if cached and (cached.get("filings", {}).get("_archives_merged") or not merge_archives):
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
        if merge_archives:
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
    interim_slot: tuple[int, str, str] | None = None,
    xbrl_periods: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    from sec.filing_periods import find_filing_for_period, resolve_period_filter

    if period:
        period_filter = resolve_period_filter(fiscal_year, period)
        if period_filter:
            return find_filing_for_period(
                submissions,
                period_filter,
                period_id=period,
                interim_slot=interim_slot,
                xbrl_periods=xbrl_periods,
            )
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


async def fetch_filing_html(cik: str, filing: dict[str, Any], *, force_refresh: bool = False) -> bytes:
    from filing_store import (
        invalidate_filing_html_caches,
        is_gzip_corruption_error,
        load_filing_html,
        save_filing_html,
    )

    accession = filing["accession_no_dash"]
    if force_refresh:
        invalidate_filing_html_caches(cik, accession)
    else:
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
        last_exc: Exception | None = None
        for attempt in range(2):
            try:
                resp = await _rate_limited_get(client, url)
                resp.raise_for_status()
                html_bytes = await resp.aread()
                save_filing_html(cik, accession, html_bytes)
                return html_bytes
            except Exception as exc:
                last_exc = exc
                if is_gzip_corruption_error(exc) and attempt == 0:
                    invalidate_filing_html_caches(cik, accession)
                    continue
                raise
        assert last_exc is not None
        raise last_exc

    task = asyncio.create_task(_load())
    _filing_html_inflight[key] = task
    try:
        return await task
    finally:
        _filing_html_inflight.pop(key, None)


def _html_has_ixbrl_facts(html: bytes) -> bool:
    return bool(_IX_NONFRACTION_PROBE.search(html.decode("utf-8", errors="replace")))


def _rank_ixbrl_document_candidates(
    items: list[dict[str, Any]],
    primary_document: str | None,
) -> list[str]:
    ranked: list[tuple[tuple[int, int], str]] = []
    for item in items:
        name = str(item.get("name") or "")
        lower = name.lower()
        if not lower.endswith((".htm", ".html")):
            continue
        if lower.endswith("-index.html") or lower.endswith("-index-headers.html"):
            continue
        try:
            size = int(item.get("size") or 0)
        except (TypeError, ValueError):
            size = 0
        keyword_rank = next(
            (idx for idx, token in enumerate(_IXBRL_DOC_KEYWORDS) if token in lower),
            len(_IXBRL_DOC_KEYWORDS),
        )
        primary_penalty = 1 if primary_document and name == primary_document else 0
        ranked.append(((keyword_rank, primary_penalty, -size), name))
    ranked.sort(key=lambda row: row[0])
    return [name for _, name in ranked]


async def _fetch_filing_index(cik: str, filing: dict[str, Any]) -> list[dict[str, Any]]:
    cik_int = str(int(cik))
    accession = filing["accession_no_dash"]
    url = f"{ARCHIVES_BASE}/{cik_int}/{accession}/index.json"
    client = await get_http_client()
    resp = await _rate_limited_get(client, url)
    resp.raise_for_status()
    data = resp.json()
    items = data.get("directory", {}).get("item", [])
    if isinstance(items, dict):
        return [items]
    return list(items)


async def fetch_filing_document(cik: str, accession_no_dash: str, document_name: str) -> bytes:
    url = f"{ARCHIVES_BASE}/{int(cik)}/{accession_no_dash}/{document_name}"
    client = await get_http_client()
    resp = await _rate_limited_get(client, url)
    resp.raise_for_status()
    return await resp.aread()


async def fetch_filing_ixbrl_html(cik: str, filing: dict[str, Any], *, force_refresh: bool = False) -> bytes:
    """Load the best inline-XBRL HTML for a filing (primary doc or 6-K exhibit)."""
    from filing_store import load_filing_ixbrl_html, save_filing_ixbrl_html

    accession = filing["accession_no_dash"]
    if force_refresh:
        from filing_store import invalidate_filing_html_caches

        invalidate_filing_html_caches(cik, accession)
    else:
        cached = load_filing_ixbrl_html(cik, accession)
        if cached:
            return cached

    key = (cik, accession)
    in_flight = _filing_ixbrl_inflight.get(key)
    if in_flight is not None:
        return await in_flight

    async def _load() -> bytes:
        primary_html = await fetch_filing_html(cik, filing, force_refresh=force_refresh)
        if _html_has_ixbrl_facts(primary_html):
            save_filing_ixbrl_html(cik, accession, primary_html)
            return primary_html

        form = (filing.get("form") or "").replace("/A", "").upper()
        if form != "6-K":
            save_filing_ixbrl_html(cik, accession, primary_html)
            return primary_html

        try:
            index_items = await _fetch_filing_index(cik, filing)
        except httpx.HTTPError:
            return primary_html

        for doc_name in _rank_ixbrl_document_candidates(
            index_items,
            filing.get("primary_document"),
        ):
            if doc_name == filing.get("primary_document"):
                continue
            try:
                html = await fetch_filing_document(cik, accession, doc_name)
            except httpx.HTTPError:
                continue
            if _html_has_ixbrl_facts(html):
                save_filing_ixbrl_html(cik, accession, html)
                return html

        return primary_html

    task = asyncio.create_task(_load())
    _filing_ixbrl_inflight[key] = task
    try:
        return await task
    finally:
        _filing_ixbrl_inflight.pop(key, None)


_FINANCIAL_HTML_MARKERS: tuple[bytes, ...] = (
    b"consolidated",
    b"financial",
    b"revenue",
    b"net income",
    b"total assets",
)


def _html_financial_score(html: bytes) -> int:
    lower = html.lower()
    return sum(marker in lower for marker in _FINANCIAL_HTML_MARKERS)


async def fetch_filing_report_html(cik: str, filing: dict[str, Any], *, force_refresh: bool = False) -> bytes:
    """Load the best financial report HTML for a filing (6-K exhibits are often separate)."""
    from filing_store import load_filing_report_html, save_filing_report_html

    accession = filing["accession_no_dash"]
    form = (filing.get("form") or "").replace("/A", "").upper()
    if form != "6-K":
        return await fetch_filing_html(cik, filing, force_refresh=force_refresh)

    if force_refresh:
        from filing_store import invalidate_filing_html_caches

        invalidate_filing_html_caches(cik, accession)
    else:
        cached = load_filing_report_html(cik, accession)
        if cached:
            return cached

    primary_html = await fetch_filing_html(cik, filing, force_refresh=force_refresh)
    try:
        index_items = await _fetch_filing_index(cik, filing)
    except httpx.HTTPError:
        return primary_html

    best = primary_html
    best_score = _html_financial_score(primary_html)
    for doc_name in _rank_ixbrl_document_candidates(
        index_items,
        filing.get("primary_document"),
    ):
        if doc_name == filing.get("primary_document"):
            continue
        try:
            html = await fetch_filing_document(cik, accession, doc_name)
        except httpx.HTTPError:
            continue
        score = _html_financial_score(html)
        if score > best_score or (score == best_score and len(html) > len(best)):
            best = html
            best_score = score

    if best is not primary_html:
        save_filing_report_html(cik, accession, best)
    return best
