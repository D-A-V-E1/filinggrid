"""Section HTML tier gate uses compare period, not arbitrary column fiscal years."""

from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from middleware import AuthContext, check_free_period_access


@pytest.mark.anyio
async def test_section_gate_allows_same_compare_period_for_two_tickers():
    """Both tickers in a free compare should pass when period matches allowlist."""
    auth = AuthContext(tier="free")
    prior_year = datetime.now().year - 1
    period_id = f"annual-{prior_year}"
    periods = [
        {"id": "interim-2026-03-31", "kind": "interim", "fiscal_year": 2026},
        {"id": period_id, "kind": "annual", "fiscal_year": prior_year},
    ]
    with patch("filing_parser.list_periods_for_tickers", new_callable=AsyncMock) as mock_periods:
        mock_periods.return_value = periods
        await check_free_period_access(auth, ["NVDA"], prior_year, period_id)
        await check_free_period_access(auth, ["AMD"], prior_year, period_id)


@pytest.mark.anyio
async def test_section_gate_blocks_mismatched_column_fy_without_period():
    """Per-column fiscal year alone can block while compare period would allow."""
    auth = AuthContext(tier="free")
    deep_year = datetime.now().year - 3
    with patch("filing_parser.list_periods_for_tickers", new_callable=AsyncMock) as mock_periods:
        mock_periods.return_value = [
            {"id": "interim-2026-03-31", "kind": "interim", "fiscal_year": 2026},
            {"id": f"annual-{datetime.now().year - 1}", "kind": "annual", "fiscal_year": datetime.now().year - 1},
        ]
        with pytest.raises(HTTPException) as exc:
            await check_free_period_access(auth, ["AMD"], deep_year, None)
    assert exc.value.status_code == 402
    assert exc.value.detail["reason"] == "historical_data"
