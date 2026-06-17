"""Tests for full XBRL financial statement extraction and Pro-only API gate."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app
from sec.xbrl_client import extract_statement_tables

client = TestClient(app)


def _obs(val: float, *, fy: int, fp: str, end: str, form: str) -> dict:
    return {"val": val, "fy": fy, "fp": fp, "end": end, "form": form, "filed": end}


def _concept(units: dict[str, list[dict]]) -> dict:
    return {"label": "test", "units": units}


SAMPLE_COMPANYFACTS = {
    "entityName": "Test Corp",
    "cik": "1234567",
    "facts": {
        "us-gaap": {
            "Revenues": _concept(
                {
                    "USD": [
                        _obs(1000, fy=2024, fp="FY", end="2024-12-31", form="10-K"),
                        _obs(900, fy=2023, fp="FY", end="2023-12-31", form="10-K"),
                        _obs(250, fy=2024, fp="Q3", end="2024-09-30", form="10-Q"),
                    ]
                }
            ),
            "NetIncomeLoss": _concept(
                {
                    "USD": [
                        _obs(100, fy=2024, fp="FY", end="2024-12-31", form="10-K"),
                        _obs(80, fy=2023, fp="FY", end="2023-12-31", form="10-K"),
                        _obs(30, fy=2024, fp="Q3", end="2024-09-30", form="10-Q"),
                    ]
                }
            ),
            "Assets": _concept(
                {
                    "USD": [
                        _obs(5000, fy=2024, fp="FY", end="2024-12-31", form="10-K"),
                        _obs(4800, fy=2024, fp="Q3", end="2024-09-30", form="10-Q"),
                    ]
                }
            ),
            "Liabilities": _concept(
                {
                    "USD": [
                        _obs(2000, fy=2024, fp="FY", end="2024-12-31", form="10-K"),
                    ]
                }
            ),
            "StockholdersEquity": _concept(
                {
                    "USD": [
                        _obs(3000, fy=2024, fp="FY", end="2024-12-31", form="10-K"),
                    ]
                }
            ),
            "NetCashProvidedByUsedInOperatingActivities": _concept(
                {
                    "USD": [
                        _obs(150, fy=2024, fp="FY", end="2024-12-31", form="10-K"),
                        _obs(40, fy=2024, fp="Q3", end="2024-09-30", form="10-Q"),
                    ]
                }
            ),
            "EarningsPerShareDiluted": _concept(
                {
                    "USD/shares": [
                        _obs(1.25, fy=2024, fp="FY", end="2024-12-31", form="10-K"),
                    ]
                }
            ),
        }
    },
}


def test_extract_statement_tables_filters_annual_fy():
    result = extract_statement_tables(SAMPLE_COMPANYFACTS, fiscal_year=2024)
    income = result["statements"]["income_statement"]["rows"]
    revenue = next(r for r in income if r["key"] == "revenue")
    assert revenue["value"] == 1000
    assert revenue["fp"] == "FY"
    assert result["period"]["fy"] == 2024


def test_extract_statement_tables_filters_prior_annual_fy():
    result = extract_statement_tables(SAMPLE_COMPANYFACTS, fiscal_year=2023)
    income = result["statements"]["income_statement"]["rows"]
    revenue = next(r for r in income if r["key"] == "revenue")
    assert revenue["value"] == 900
    assert revenue["fy"] == 2023


def test_extract_statement_tables_filters_interim_period():
    result = extract_statement_tables(
        SAMPLE_COMPANYFACTS,
        period="interim-2024-09-30",
    )
    income = result["statements"]["income_statement"]["rows"]
    revenue = next(r for r in income if r["key"] == "revenue")
    assert revenue["value"] == 250
    assert revenue["fp"] == "Q3"
    assert revenue["end"] == "2024-09-30"

    cash_flow = result["statements"]["cash_flow"]["rows"]
    ocf = next(r for r in cash_flow if r["key"] == "operating_cash_flow")
    assert ocf["value"] == 40


def test_extract_statement_tables_annual_fy_falls_back_to_interim():
    """When FY 10-K is not filed yet, fiscal_year alone should use latest interim quarter."""
    facts = {
        "facts": {
            "us-gaap": {
                "Revenues": _concept(
                    {
                        "USD": [
                            _obs(500, fy=2026, fp="Q1", end="2026-03-31", form="10-Q"),
                            _obs(400, fy=2025, fp="FY", end="2025-12-31", form="10-K"),
                        ]
                    }
                ),
                "NetIncomeLoss": _concept(
                    {
                        "USD": [
                            _obs(50, fy=2026, fp="Q1", end="2026-03-31", form="10-Q"),
                        ]
                    }
                ),
            }
        }
    }
    result = extract_statement_tables(facts, fiscal_year=2026)
    income = result["statements"]["income_statement"]["rows"]
    assert len(income) >= 1
    revenue = next(r for r in income if r["key"] == "revenue")
    assert revenue["value"] == 500
    assert revenue["fp"] == "Q1"


def test_extract_statement_tables_interim_fp_slot():
    facts = SAMPLE_COMPANYFACTS
    result = extract_statement_tables(facts, period="interim-2024-Q3-10-Q")
    income = result["statements"]["income_statement"]["rows"]
    revenue = next(r for r in income if r["key"] == "revenue")
    assert revenue["fp"] == "Q3"
    assert revenue["value"] == 250


def test_extract_statement_tables_includes_balance_sheet_rows():
    result = extract_statement_tables(SAMPLE_COMPANYFACTS, fiscal_year=2024)
    balance = result["statements"]["balance_sheet"]["rows"]
    keys = {r["key"] for r in balance}
    assert "total_assets" in keys
    assert "total_liabilities" in keys
    assert "stockholders_equity" in keys


def test_statements_endpoint_blocks_free_tier():
    with patch(
        "main.fetch_ticker_financial_statements",
        new_callable=AsyncMock,
    ) as mock_fetch:
        mock_fetch.return_value = {"ticker": "TEST", "statements": {}}
        res = client.get(
            "/filings/TEST/financials/statements?fiscal_year=2024",
            headers={"X-Dev-Tier": "free"},
        )
    assert res.status_code == 402, res.text
    assert res.json()["detail"]["reason"] == "subscription_required"
    mock_fetch.assert_not_called()


@patch("middleware.settings")
def test_statements_endpoint_allows_pro_tier(mock_settings):
    mock_settings.allow_dev_tier_toggle = True
    mock_settings.dev_pro_tier = False
    mock_settings.auth_configured = False

    mock_payload = {
        "ticker": "TEST",
        "cik": "0001234567",
        "entity_name": "Test Corp",
        "fiscal_year_filter": 2024,
        "period_filter": None,
        "source": "sec_companyfacts",
        "from_cache": True,
        "fetch_ms": 1.0,
        "period": {"kind": "annual", "fy": 2024, "fp": "FY"},
        "statements": {
            "income_statement": {"label": "Income Statement", "rows": []},
            "balance_sheet": {"label": "Balance Sheet", "rows": []},
            "cash_flow": {"label": "Cash Flow", "rows": []},
        },
    }
    with patch(
        "main.fetch_ticker_financial_statements",
        new_callable=AsyncMock,
    ) as mock_fetch:
        mock_fetch.return_value = mock_payload
        with patch("main.check_free_period_access", new_callable=AsyncMock):
            res = client.get(
                "/filings/TEST/financials/statements?fiscal_year=2024",
                headers={"X-Dev-Tier": "professional"},
            )
    assert res.status_code == 200, res.text
    assert res.json()["ticker"] == "TEST"
    mock_fetch.assert_called_once()
