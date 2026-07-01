"""On-demand section HTML must tolerate bad cache entries and fall back to text."""

from unittest.mock import AsyncMock, patch

import pytest

from filing_parser import SectionHtmlResponse, get_section_html


@pytest.mark.anyio
async def test_html_uses_disk_section_cache_before_extract():
    with patch("filing_parser._section_html_from_parsed_cache", return_value=None), patch(
        "filing_parser.find_cache_key", return_value="JPM:2025:acc"
    ), patch(
        "filing_parser.find_section_html", return_value="<p>disk cached</p>"
    ), patch("filing_parser.store_section_html") as store, patch(
        "filing_parser._extract_and_cache_section", new_callable=AsyncMock
    ) as extract:
        result = await get_section_html("JPM", "risk-factors", 2025, content_format="html")

    extract.assert_not_awaited()
    store.assert_called_once()
    assert "disk cached" in result.html


@pytest.mark.anyio
async def test_html_uses_fresh_extract_not_stale_disk_scan():
    """HTML requests must extract from the active cache key, not scan unrelated disk entries."""
    with patch("filing_parser._section_html_from_parsed_cache", return_value=None), patch(
        "filing_parser._extract_and_cache_section",
        new_callable=AsyncMock,
        return_value=("<p>fresh html</p>", "fresh text", "XOM:2025:acc"),
    ) as extract:
        result = await get_section_html("XOM", "financial-statements", 2025, content_format="html")

    extract.assert_awaited()
    assert result.html == "<p>fresh html</p>"


@pytest.mark.anyio
async def test_html_falls_back_to_text_when_extraction_empty():
    with patch("filing_parser._section_html_from_parsed_cache", return_value=None), patch(
        "filing_parser._extract_and_cache_section",
        new_callable=AsyncMock,
        side_effect=[
            (None, None, "XOM:2025:acc"),
            (None, "Reference is made to Item 8.", "XOM:2025:acc"),
        ],
    ):
        result = await get_section_html("XOM", "financial-statements", 2025, content_format="html")

    assert "Reference is made to Item 8." in result.html
    assert result.text == "Reference is made to Item 8."


@pytest.mark.anyio
async def test_bad_cached_html_is_discarded_and_re_extracted():
    with patch(
        "filing_parser._section_html_from_parsed_cache",
        return_value=None,
    ), patch(
        "filing_parser._extract_and_cache_section",
        new_callable=AsyncMock,
        return_value=("<table><tr><td>ok</td></tr></table>", "ok", "XOM:2025:acc"),
    ):
        result = await get_section_html("XOM", "mda", 2025, content_format="html")

    assert "ok" in result.html
    assert isinstance(result, SectionHtmlResponse)
