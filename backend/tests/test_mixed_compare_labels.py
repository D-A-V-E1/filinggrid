"""Live retrieval tests: domestic + foreign filers, mixed compare labels."""

from __future__ import annotations

import asyncio
import re

import pytest

from filing_parser import ParseRequest, parse_filings
from sec.client import find_filing, fetch_submissions, fetch_ticker_map, resolve_ticker
from sec.filing_periods import (
    list_comparable_filings,
    merge_filing_periods,
    resolve_interim_slot_for_tickers,
)
from sec.xbrl_client import fetch_company_facts, list_reporting_periods

DOMESTIC = ("AAPL", "NVDA")
FOREIGN = ("TSM",)
MIXED = ("AAPL", "NVDA", "TSM")

ANNUAL_PERIOD = "annual-2024"
INTERIM_PERIOD = "interim-2024-Q3"

DOMESTIC_ANNUAL = re.compile(r"^10-K(/A)?$")
DOMESTIC_INTERIM = re.compile(r"^10-Q(/A)?$")
FOREIGN_ANNUAL = re.compile(r"^20-F(/A)?$")
FOREIGN_INTERIM = re.compile(r"^6-K$")


async def _xbrl_periods(cik: str) -> list[dict]:
    try:
        facts, _ = await fetch_company_facts(cik)
        return list_reporting_periods(facts)
    except Exception:
        return []


async def _filing_form_for_ticker(ticker: str, period: str) -> str:
    ticker_map = await fetch_ticker_map()
    resolved = await resolve_ticker(ticker, ticker_map)
    submissions = await fetch_submissions(resolved["cik"])
    xbrl = await _xbrl_periods(resolved["cik"])
    interim_slot = await resolve_interim_slot_for_tickers([ticker], period, ticker_map)
    filing = find_filing(
        submissions,
        period=period,
        interim_slot=interim_slot,
        xbrl_periods=xbrl or None,
    )
    assert filing is not None, f"{ticker}: no filing for {period}"
    return filing["form"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_domestic_filers_resolve_10k_and_10q():
    for ticker in DOMESTIC:
        annual = await _filing_form_for_ticker(ticker, ANNUAL_PERIOD)
        interim = await _filing_form_for_ticker(ticker, INTERIM_PERIOD)
        assert DOMESTIC_ANNUAL.match(annual), f"{ticker} annual: {annual}"
        assert DOMESTIC_INTERIM.match(interim), f"{ticker} interim: {interim}"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_foreign_filer_resolves_20f_and_6k():
    for ticker in FOREIGN:
        annual = await _filing_form_for_ticker(ticker, ANNUAL_PERIOD)
        interim = await _filing_form_for_ticker(ticker, INTERIM_PERIOD)
        assert FOREIGN_ANNUAL.match(annual), f"{ticker} annual: {annual}"
        assert FOREIGN_INTERIM.match(interim), f"{ticker} interim: {interim}"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_mixed_compare_period_merge_and_labels():
    ticker_map = await fetch_ticker_map()
    period_lists = []
    for ticker in MIXED:
        resolved = await resolve_ticker(ticker, ticker_map)
        subs = await fetch_submissions(resolved["cik"])
        xbrl = await _xbrl_periods(resolved["cik"])
        period_lists.append(list_comparable_filings(subs, xbrl_periods=xbrl or None))

    merged = merge_filing_periods(period_lists)
    assert merged, "mixed compare should expose shared fiscal periods"

    by_id = {o["id"]: o for o in merged}
    assert ANNUAL_PERIOD in by_id
    assert INTERIM_PERIOD in by_id

    annual_opt = by_id[ANNUAL_PERIOD]
    interim_opt = by_id[INTERIM_PERIOD]
    assert annual_opt["label"] == "FY24"
    assert interim_opt["label"] == "FY24 · Q3"
    assert "10-K" not in annual_opt["label"]
    assert "20-F" not in annual_opt["label"]
    assert "10-Q" not in interim_opt["label"]
    assert "6-K" not in interim_opt["label"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_mixed_compare_parse_column_forms():
    for period, domestic_re, foreign_re in (
        (ANNUAL_PERIOD, DOMESTIC_ANNUAL, FOREIGN_ANNUAL),
        (INTERIM_PERIOD, DOMESTIC_INTERIM, FOREIGN_INTERIM),
    ):
        response = await parse_filings(
            ParseRequest(tickers=list(MIXED), period=period)
        )
        forms = {col.ticker: col.form for col in response.columns}
        assert len(forms) == len(MIXED)
        for ticker in DOMESTIC:
            assert forms[ticker] and domestic_re.match(forms[ticker]), (
                f"{ticker} @ {period}: {forms[ticker]}"
            )
        for ticker in FOREIGN:
            assert forms[ticker] and foreign_re.match(forms[ticker]), (
                f"{ticker} @ {period}: {forms[ticker]}"
            )
