"""6-K interim section heading alignment with canonical 10-Q catalog IDs."""

from sec.section_extractor import (
    _is_section_heading,
    _match_section,
    _match_toc_section,
    parse_filing_section_index,
)


def test_6k_mda_discussion_and_analysis():
    heading = "Discussion and Analysis"
    assert _match_section(heading) == ("mda", "Item 7 — MD&A")
    assert _is_section_heading(heading) is True


def test_6k_mda_management_discussion_full_title():
    heading = "MANAGEMENT'S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND RESULTS OF OPERATIONS"
    assert _match_section(heading) == ("mda", "Item 7 — MD&A")


def test_6k_condensed_consolidated_statements_maps_to_financial_statements():
    heading = "Condensed Consolidated Statements of Comprehensive Income"
    assert _match_section(heading) == (
        "financial-statements",
        "Item 8 — Financial Statements",
    )
    assert _is_section_heading(heading) is True


def test_6k_toc_item_2_mda():
    toc_row = "2. Management's Discussion and Analysis of Financial Condition and Results of Operations"
    assert _match_toc_section(toc_row) == ("mda", "Item 7 — MD&A")


def test_6k_lettered_risk_factors_like_20f():
    heading = "D. Risk Factors"
    assert _match_section(heading) == ("risk-factors", "Item 1A — Risk Factors")
    assert _is_section_heading(heading) is True


_MINIMAL_6K_HTML = """
<html><body>
<div><p>Discussion and Analysis</p><p>Quarterly operating review with sufficient narrative length for extraction.</p></div>
<div><p>Condensed Consolidated Financial Statements</p><p>Balance sheet and income statement tables follow here.</p></div>
<div><p>2. Management's Discussion and Analysis of Financial Condition and Results of Operations</p><p>MD&A body for interim quarter.</p></div>
</body></html>
"""


def test_minimal_6k_html_extracts_mda_and_financial_statements():
    result = parse_filing_section_index(_MINIMAL_6K_HTML.encode())
    ids = set(result["section_ids"])
    assert "mda" in ids
    assert "financial-statements" in ids
