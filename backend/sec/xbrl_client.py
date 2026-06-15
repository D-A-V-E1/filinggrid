"""SEC XBRL companyfacts client for fast financial statement metrics.

Hybrid filing model (recommended architecture)
----------------------------------------------
Full HTML parsing (BeautifulSoup) is accurate for narrative sections — MD&A, risk
factors, footnotes — but slow for large 10-K/10-Q bodies. SEC's JSON companyfacts
API exposes tagged GAAP facts across all filings for a CIK in one request.

This module is the **financials fast path**:

- **XBRL (here):** income statement / balance sheet headline metrics with periods
  (revenue, net income, assets, equity, EPS, etc.) — typically sub-second after cache.
- **HTML parse (section_extractor):** narrative and table-heavy sections unchanged.

A compare view can render financial-statements from ``financials_xbrl`` immediately
while HTML sections load in parallel, or skip HTML for Item 8 when XBRL suffices.

API: https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json
POC scope: common us-gaap tags with fallbacks; not exhaustive GAAP mapping.
"""

from __future__ import annotations

import time
from typing import Any

from sec.client import fetch_ticker_map, get_http_client, resolve_ticker, _rate_limited_get

COMPANYFACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"

# Metric key -> candidate us-gaap concept names (first match wins)
METRIC_CONCEPTS: dict[str, list[str]] = {
    "revenue": [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
    ],
    "net_income": ["NetIncomeLoss", "ProfitLoss"],
    "total_assets": ["Assets"],
    "total_liabilities": ["Liabilities"],
    "stockholders_equity": [
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ],
    "operating_income": ["OperatingIncomeLoss"],
    "eps_basic": ["EarningsPerShareBasic"],
    "eps_diluted": ["EarningsPerShareDiluted"],
    "cash": [
        "CashAndCashEquivalentsAtCarryingValue",
        "CashCashEquivalentsAndShortTermInvestments",
    ],
}

METRIC_LABELS: dict[str, str] = {
    "revenue": "Revenue",
    "net_income": "Net income",
    "total_assets": "Total assets",
    "total_liabilities": "Total liabilities",
    "stockholders_equity": "Stockholders' equity",
    "operating_income": "Operating income",
    "eps_basic": "EPS (basic)",
    "eps_diluted": "EPS (diluted)",
    "cash": "Cash & equivalents",
}

MAX_ANNUAL_PERIODS = 5
MAX_QUARTERLY_PERIODS = 8


async def fetch_company_facts(cik: str) -> tuple[dict[str, Any], bool]:
    """Fetch raw companyfacts JSON; returns (data, from_cache)."""
    from filing_store import load_company_facts, save_company_facts

    cached = load_company_facts(cik)
    if cached:
        return cached, True

    cik_padded = str(int(cik)).zfill(10)
    url = COMPANYFACTS_URL.format(cik=cik_padded)
    client = await get_http_client()
    resp = await _rate_limited_get(client, url, data_api=True)
    resp.raise_for_status()
    data = resp.json()
    save_company_facts(cik, data)
    return data, False


def _pick_concept(gaap: dict[str, Any], candidates: list[str]) -> dict[str, Any] | None:
    """Pick the candidate concept with the most recent 10-K annual observation."""
    best: dict[str, Any] | None = None
    best_end = ""
    for name in candidates:
        concept = gaap.get(name)
        if not concept:
            continue
        _, entries = _unit_entries(concept)
        annual = _filter_annual(entries, None)
        if not annual:
            continue
        latest_end = annual[0].get("end") or ""
        if latest_end > best_end:
            best_end = latest_end
            best = concept
    return best


def _unit_entries(concept: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    units = concept.get("units") or {}
    if not units:
        return "", []
    # Prefer USD for monetary; pure for EPS
    for preferred in ("USD", "USD/shares", "shares"):
        if preferred in units:
            return preferred, list(units[preferred])
    key = next(iter(units))
    return key, list(units[key])


def _dedupe_observations(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, ...]] = set()
    out: list[dict[str, Any]] = []
    for e in entries:
        key = (e.get("fy"), e.get("fp"), e.get("end"), e.get("form"), e.get("val"))
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out


def _sort_observations(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        entries,
        key=lambda e: (e.get("end") or "", e.get("filed") or ""),
        reverse=True,
    )


def _filter_annual(entries: list[dict[str, Any]], fiscal_year: int | None) -> list[dict[str, Any]]:
    annual = [e for e in entries if e.get("fp") == "FY" and e.get("form") in ("10-K", "10-K/A", None, "")]
    annual = [e for e in annual if e.get("form") in ("10-K", "10-K/A")]
    annual = _dedupe_observations(_sort_observations(annual))
    if fiscal_year is not None:
        annual = [e for e in annual if e.get("fy") == fiscal_year]
    return annual[:MAX_ANNUAL_PERIODS]


def _filter_quarterly(entries: list[dict[str, Any]], fiscal_year: int | None) -> list[dict[str, Any]]:
    quarterly = [
        e
        for e in entries
        if e.get("fp") in ("Q1", "Q2", "Q3", "Q4") and e.get("form") in ("10-Q", "10-Q/A")
    ]
    quarterly = _dedupe_observations(_sort_observations(quarterly))
    if fiscal_year is not None:
        quarterly = [e for e in quarterly if e.get("fy") == fiscal_year]
    return quarterly[:MAX_QUARTERLY_PERIODS]


def _obs_to_period(obs: dict[str, Any]) -> dict[str, Any]:
    return {
        "fy": obs.get("fy"),
        "fp": obs.get("fp"),
        "end": obs.get("end"),
        "value": obs.get("val"),
        "form": obs.get("form"),
        "filed": obs.get("filed"),
        "accn": obs.get("accn"),
    }


def extract_financial_metrics(
    facts: dict[str, Any],
    *,
    fiscal_year: int | None = None,
) -> dict[str, Any]:
    """Map raw companyfacts payload to compare-friendly metrics."""
    gaap = (facts.get("facts") or {}).get("us-gaap") or {}
    metrics: dict[str, Any] = {}

    for key, concepts in METRIC_CONCEPTS.items():
        concept = _pick_concept(gaap, concepts)
        if not concept:
            continue
        unit, entries = _unit_entries(concept)
        annual = _filter_annual(entries, fiscal_year)
        quarterly = _filter_quarterly(entries, fiscal_year)
        if not annual and not quarterly:
            continue
        metrics[key] = {
            "label": METRIC_LABELS.get(key, concept.get("label", key)),
            "concept": concept.get("label"),
            "unit": unit,
            "annual": [_obs_to_period(o) for o in annual],
            "quarterly": [_obs_to_period(o) for o in quarterly],
        }

    # Pivot annual metrics by fiscal year for side-by-side compare rows
    years: set[int] = set()
    for m in metrics.values():
        for p in m.get("annual", []):
            if p.get("fy") is not None:
                years.add(int(p["fy"]))
    annual_summary: list[dict[str, Any]] = []
    for fy in sorted(years, reverse=True)[:MAX_ANNUAL_PERIODS]:
        row: dict[str, Any] = {"fy": fy}
        for key, m in metrics.items():
            match = next((p for p in m.get("annual", []) if p.get("fy") == fy), None)
            if match:
                row[key] = match["value"]
                row[f"{key}_end"] = match.get("end")
        annual_summary.append(row)

    return {
        "entity_name": facts.get("entityName"),
        "cik": str(facts.get("cik", "")).zfill(10),
        "metrics": metrics,
        "annual_summary": annual_summary,
    }


async def fetch_ticker_financials(
    ticker: str,
    fiscal_year: int | None = None,
    *,
    ticker_map: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Resolve ticker, fetch companyfacts, return structured financial metrics."""
    started = time.perf_counter()
    resolved = await resolve_ticker(ticker, ticker_map)
    facts, from_cache = await fetch_company_facts(resolved["cik"])
    extracted = extract_financial_metrics(facts, fiscal_year=fiscal_year)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)

    cik_padded = str(int(resolved["cik"])).zfill(10)
    return {
        "ticker": resolved["ticker"],
        "cik": resolved["cik"],
        "entity_name": extracted.get("entity_name") or resolved["company_name"],
        "fiscal_year_filter": fiscal_year,
        "source": "sec_companyfacts",
        "api_url": COMPANYFACTS_URL.format(cik=cik_padded),
        "from_cache": from_cache,
        "fetch_ms": elapsed_ms,
        **{k: v for k, v in extracted.items() if k not in ("entity_name", "cik")},
    }
