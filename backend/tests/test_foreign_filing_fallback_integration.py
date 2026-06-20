"""Integration tests for shared 20-F / 6-K filing-level financial fallback."""

import asyncio
from unittest.mock import AsyncMock, patch

from sec.xbrl_client import (
    _apply_filing_level_financial_fallback,
    fetch_ticker_financials,
)


def test_apply_filing_level_financial_fallback_20f_ixbrl():
    empty = {"annual_summary": [], "metrics": {}}
    ixbrl_payload = {
        "annual_summary": [{"fy": 2025, "revenue": 100.0, "revenue_end": "2025-12-31"}],
        "metrics": {"revenue": {"unit": "USD", "annual": []}},
    }

    async def _run():
        with patch(
            "sec.xbrl_client._load_filing_html_for_period",
            new=AsyncMock(
                return_value=(
                    b'<ix:nonFraction name="ifrs-full:Revenue">1</ix:nonFraction>',
                    {"form": "20-F", "report_date": "2025-12-31"},
                )
            ),
        ), patch(
            "sec.client._html_has_ixbrl_facts",
            return_value=True,
        ), patch(
            "sec.xbrl_client.extract_financial_metrics_from_ixbrl",
            return_value=ixbrl_payload,
        ):
            return await _apply_filing_level_financial_fallback(
                "0001046179",
                2025,
                "annual-2025-20f",
                pf=None,
                period_kind="annual",
                report_date=None,
                extracted=empty,
            )

    extracted, source, _, _ = asyncio.run(_run())
    assert source == "sec_ixbrl_filing"
    assert extracted["annual_summary"][0]["revenue"] == 100.0


def test_apply_filing_level_financial_fallback_6k_html_when_ixbrl_empty():
    empty = {"annual_summary": [], "metrics": {}}
    html_payload = {
        "annual_summary": [{"fy": 2026, "revenue": 50.0, "revenue_end": "2026-03-31"}],
        "metrics": {"revenue": {"unit": "USD", "annual": []}},
    }

    async def _load_html(cik, fiscal_year, period, *, prefer_ixbrl=False, prefer_report=False):
        if prefer_report:
            return (b"<table>NET REVENUE</table>", {"form": "6-K", "report_date": "2026-03-31"})
        return (b"<html>no ix tags</html>", {"form": "6-K", "report_date": "2026-03-31"})

    async def _run():
        with patch("sec.xbrl_client._load_filing_html_for_period", side_effect=_load_html), patch(
            "sec.client._html_has_ixbrl_facts",
            return_value=False,
        ), patch(
            "sec.xbrl_client.extract_financial_metrics_from_html_tables",
            return_value=html_payload,
        ):
            pf = type("PF", (), {"fp": "Q1", "kind": "interim"})()
            return await _apply_filing_level_financial_fallback(
                "0001046179",
                2026,
                "interim-2026-03-31-6k",
                pf=pf,
                period_kind="interim",
                report_date="2026-03-31",
                extracted=empty,
            )

    extracted, source, _, _ = asyncio.run(_run())
    assert source == "sec_html_filing"
    assert extracted["annual_summary"][0]["revenue"] == 50.0


def test_apply_filing_level_financial_fallback_6k_slot_without_report_date():
    empty = {"annual_summary": [], "metrics": {}}
    ixbrl_payload = {
        "annual_summary": [{"fy": 2026, "revenue": 50.0, "revenue_end": "2026-03-31"}],
        "metrics": {"revenue": {"unit": "USD", "annual": []}},
    }
    pf = type("PF", (), {"fp": "Q1", "fiscal_year": 2026, "kind": "interim", "report_date": None})()

    async def _run():
        with patch(
            "sec.xbrl_client._load_filing_html_for_period",
            new=AsyncMock(
                return_value=(
                    b'<ix:nonFraction name="ifrs-full:Revenue">1</ix:nonFraction>',
                    {"form": "6-K", "report_date": "2026-04-28", "period_end": "2026-03-31"},
                )
            ),
        ), patch(
            "sec.client._html_has_ixbrl_facts",
            return_value=True,
        ), patch(
            "sec.xbrl_client.extract_financial_metrics_from_ixbrl",
            return_value=ixbrl_payload,
        ) as mock_ixbrl:
            extracted, source, _, _ = await _apply_filing_level_financial_fallback(
                "0001033767",
                2026,
                "interim-2026-Q1",
                pf=pf,
                period_kind="interim",
                report_date=None,
                extracted=empty,
            )
            return extracted, source, mock_ixbrl

    extracted, source, mock_ixbrl = asyncio.run(_run())
    assert source == "sec_ixbrl_filing"
    assert extracted["annual_summary"][0]["revenue"] == 50.0
    assert mock_ixbrl.call_args.kwargs["report_date"] == "2026-03-31"
    assert mock_ixbrl.call_args.kwargs["fp"] == "Q1"


def test_fetch_ticker_financials_uses_shared_fallback():
    facts = {"entityName": "TSMC", "facts": {"ifrs-full": {}}}
    ixbrl_payload = {
        "annual_summary": [{"fy": 2025, "revenue": 726.0, "revenue_end": "2025-12-31"}],
        "metrics": {"revenue": {"unit": "USD", "annual": []}},
    }

    async def _run():
        with patch(
            "sec.xbrl_client.resolve_ticker",
            new=AsyncMock(return_value={"ticker": "TSM", "cik": "1046179", "company_name": "TSMC"}),
        ), patch(
            "sec.xbrl_client.fetch_company_facts",
            new=AsyncMock(return_value=(facts, False)),
        ), patch(
            "sec.xbrl_client._apply_filing_level_financial_fallback",
            new=AsyncMock(return_value=(ixbrl_payload, "sec_ixbrl_filing", b"html", {"form": "20-F"})),
        ):
            return await fetch_ticker_financials("TSM", fiscal_year=2025, period="annual-2025-20f")

    result = asyncio.run(_run())
    assert result["source"] == "sec_ixbrl_filing"
    assert result["annual_summary"][0]["revenue"] == 726.0


def test_fetch_ticker_financials_interim_6k_slot_resolves_period_end():
    """Slot-based interim id (interim-2026-Q1) must resolve 6-K period end for fallback."""
    facts = {"entityName": "UMC", "facts": {"ifrs-full": {}}}
    ixbrl_payload = {
        "annual_summary": [{"fy": 2026, "revenue": 50.0, "revenue_end": "2026-03-31"}],
        "metrics": {"revenue": {"unit": "USD", "annual": []}},
    }
    filing_meta = {
        "form": "6-K",
        "report_date": "2026-04-28",
        "period_end": "2026-03-31",
        "accession_no_dash": "000114036126012345",
    }

    async def _run():
        with patch(
            "sec.xbrl_client.resolve_ticker",
            new=AsyncMock(
                return_value={"ticker": "UMC", "cik": "1033767", "company_name": "United Microelectronics Corporation"}
            ),
        ), patch(
            "sec.xbrl_client.fetch_company_facts",
            new=AsyncMock(return_value=(facts, True)),
        ), patch(
            "sec.xbrl_client._resolve_filing_for_period",
            new=AsyncMock(return_value=filing_meta),
        ), patch(
            "sec.xbrl_client._apply_filing_level_financial_fallback",
            new=AsyncMock(return_value=(ixbrl_payload, "sec_ixbrl_filing", b"html", filing_meta)),
        ) as mock_fallback:
            return await fetch_ticker_financials("UMC", period="interim-2026-Q1", headline_only=True), mock_fallback

    result, mock_fallback = asyncio.run(_run())
    assert result["source"] == "sec_ixbrl_filing"
    assert result["annual_summary"][0]["revenue"] == 50.0
    assert mock_fallback.await_args.kwargs["report_date"] == "2026-03-31"
    assert mock_fallback.await_args.args[1] == 2026
