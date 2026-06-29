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


def test_6k_exhibit_prefix_consolidated_financial_statements():
    heading = "Exhibit 99.1 Consolidated Financial Statements"
    assert _match_section(heading) == ("financial-statements", "Item 8 — Financial Statements")
    assert _is_section_heading(heading) is True


def test_6k_operating_and_financial_reviews_plural():
    heading = "OPERATING AND FINANCIAL REVIEWS AND PROSPECTS"
    assert _match_section(heading) == ("mda", "Item 7 — MD&A")


_MINIMAL_6K_HTML = """
<html><body>
<div><p>Discussion and Analysis</p><p>Quarterly operating review with sufficient narrative length for extraction.</p></div>
<div><p>Condensed Consolidated Financial Statements</p><p>Balance sheet and income statement tables follow here.</p></div>
<div><p>2. Management's Discussion and Analysis of Financial Condition and Results of Operations</p><p>MD&A body for interim quarter.</p></div>
</body></html>
"""


def test_6k_consolidated_financial_statements_long_title():
    heading = (
        "Consolidated Financial Statements for the Nine Months Ended September 30, 2025 "
        "and 2024 and Independent Auditors' Review Report"
    )
    assert _match_section(heading) == (
        "financial-statements",
        "Item 8 — Financial Statements",
    )
    assert _is_section_heading(heading) is True


def test_6k_exhibit_prefixed_consolidated_statements():
    heading = "Exhibit 99.1 Consolidated Financial Statements for the Nine Months Ended September 30, 2025"
    assert _match_section(heading) == (
        "financial-statements",
        "Item 8 — Financial Statements",
    )


def test_6k_notes_to_consolidated_financial_statements():
    heading = "Notes to Consolidated Financial Statements"
    assert _match_section(heading) == (
        "financial-statements",
        "Item 8 — Financial Statements",
    )


_MINIMAL_TSM_6K_COVER_HTML = """
<html><body>
<p>FORM 6-K</p>
<p>Exhibit 99.1 Consolidated Financial Statements for the Nine Months Ended September 30, 2025</p>
<p>Notes to Consolidated Financial Statements</p>
<p>Revenue Recognition</p>
<p>Segment Information</p>
<p>Cash and Cash Equivalents</p>
</body></html>
"""


def test_tsm_style_6k_cover_extracts_financial_and_notes():
    result = parse_filing_section_index(_MINIMAL_TSM_6K_COVER_HTML.encode())
    ids = set(result["section_ids"])
    assert "financial-statements" in ids
    assert "note-revenue" in ids
    assert "note-segments" in ids
    assert "note-cash" in ids


def test_minimal_6k_html_extracts_mda_and_financial_statements():
    result = parse_filing_section_index(_MINIMAL_6K_HTML.encode())
    ids = set(result["section_ids"])
    assert "mda" in ids
    assert "financial-statements" in ids

