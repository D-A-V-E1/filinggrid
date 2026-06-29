"""Tests for XBRL footnote section extraction."""

from unittest.mock import AsyncMock, patch

import pytest

from sec.xbrl_client import (
    _extract_ix_text_block,
    extract_note_disclosures,
)

SAMPLE_HTML = """
<html><body>
<ix:nonNumeric name="us-gaap:FairValueDisclosuresTextBlock" continuedat="c1">
Fair value intro
</ix:nonNumeric>
<ix:continuation id="c1">Fair value table detail</ix:continuation>
<ix:nonNumeric name="us-gaap:RevenueFromContractWithCustomerTextBlock">
Revenue policy narrative
</ix:nonNumeric>
</body></html>
"""

SAMPLE_FACTS = {
    "entityName": "Test Corp",
    "facts": {
        "us-gaap": {
            "RevenueFromContractWithCustomerExcludingAssessedTax": {
                "label": "Revenue",
                "units": {
                    "USD": [
                        {
                            "val": 1000,
                            "fy": 2024,
                            "fp": "FY",
                            "end": "2024-12-31",
                            "form": "10-K",
                        }
                    ]
                },
            }
        }
    },
}


def test_extract_ix_text_block_with_continuation():
    text = _extract_ix_text_block(SAMPLE_HTML, "FairValueDisclosuresTextBlock")
    assert text is not None
    assert "Fair value intro" in text
    assert "Fair value table detail" in text


def test_extract_note_disclosures_includes_html_blocks():
    notes = extract_note_disclosures(
        SAMPLE_FACTS,
        SAMPLE_HTML.encode(),
        fiscal_year=2024,
    )
    assert "note-revenue" in notes
    assert notes["note-revenue"]["has_data"] is True
    assert len(notes["note-revenue"]["annual_summary"]) == 1
    assert any(d["concept"] == "RevenueFromContractWithCustomerTextBlock" for d in notes["note-revenue"]["disclosures"])
    assert "note-fair-value" in notes
    assert notes["note-fair-value"]["disclosures"]


def test_extract_note_disclosures_without_html_omits_text_blocks():
    notes = extract_note_disclosures(SAMPLE_FACTS, None, fiscal_year=2024)
    assert "note-revenue" in notes
    assert notes["note-revenue"]["disclosures"] == []
    assert len(notes["note-revenue"]["annual_summary"]) == 1
    assert "note-fair-value" not in notes


@pytest.mark.asyncio
async def test_load_filing_html_for_notes_fetches_when_not_cached():
    from sec import xbrl_client

    fake_html = b"<html>filing</html>"
    with (
        patch("filing_store.load_submissions", return_value={"filings": []}),
        patch("sec.xbrl_client.fetch_submissions", new_callable=AsyncMock) as fetch_subs,
        patch("sec.xbrl_client.find_filing", return_value={"accession_no_dash": "0001234567-24-000001"}),
        patch("sec.client.fetch_filing_html", new_callable=AsyncMock, return_value=fake_html) as fetch_html,
    ):
        fetch_subs.return_value = {"filings": []}
        result = await xbrl_client._load_filing_html_for_notes("1234567", 2024)
        assert result == fake_html
        fetch_html.assert_awaited_once()
