"""Financials endpoints are not column-gated (regression guard for batch 402)."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

MOCK_FINANCIALS = {
    "ticker": "AAPL",
    "cik": "0000320193",
    "entity_name": "Apple Inc.",
    "fiscal_year_filter": None,
    "source": "test",
    "from_cache": False,
    "annual_summary": [{"fy": 2025, "revenue": 1}],
}


@pytest.mark.parametrize("ticker_count", [1, 4, 8])
def test_get_financials_allows_any_column_count(ticker_count):
    with patch("main.fetch_ticker_financials", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = {**MOCK_FINANCIALS, "ticker": "AAPL"}
        for _ in range(ticker_count):
            res = client.get("/filings/AAPL/financials?headline_only=true")
            assert res.status_code == 200, res.text


def test_batch_financials_allows_four_tickers_on_free_tier():
    async def mock_stream(*_args, **_kwargs):
        yield '{"type":"done"}\n'

    with patch("main.fetch_tickers_financials_stream", side_effect=mock_stream):
        res = client.post(
            "/filings/financials/batch",
            json={
                "tickers": ["AAPL", "MSFT", "NVDA", "GOOGL"],
                "headline_only": True,
            },
            headers={"X-Dev-Tier": "free"},
        )
        assert res.status_code == 200, res.text
