"""20-F section heading alignment with canonical 10-K catalog IDs."""

from sec.section_extractor import (
    _is_section_heading,
    _match_section,
    _match_toc_section,
    parse_filing_section_index,
)


def test_20f_lettered_risk_factors_subitem_is_section_heading():
    heading = "D. Risk Factors"
    assert _match_section(heading) == ("risk-factors", "Item 1A — Risk Factors")
    assert _is_section_heading(heading) is True


def test_risk_factor_list_bullet_still_not_section_heading():
    heading = "• We may incur future impairments of our technology license purchases."
    assert _is_section_heading(heading) is False


def test_lettered_non_section_still_rejected():
    heading = "C. Reasons for the Offer and Use of Proceeds"
    assert _match_section(heading) is None
    assert _is_section_heading(heading) is False


def test_20f_legal_and_administrative_proceedings_maps_to_legal_proceedings():
    heading = "Legal and Administrative Proceedings"
    assert _match_section(heading) == ("legal-proceedings", "Item 3 — Legal Proceedings")
    assert _is_section_heading(heading) is True


def test_20f_toc_market_risk_item_number():
    toc_row = "11. Quantitative and Qualitative Disclosures About Market Risk"
    assert _match_toc_section(toc_row) == ("market-risk", "Item 7A — Market Risk")


def test_20f_mda_operating_and_financial_review():
    heading = "ITEM 5. OPERATING AND FINANCIAL REVIEW AND PROSPECTS"
    assert _match_section(heading) == ("mda", "Item 7 — MD&A")


_MINIMAL_20F_HTML = """
<html><body>
<table><tr><td><a href="#risk">D. Risk Factors</a></td></tr></table>
<div id="risk"><p>D. Risk Factors</p><p>Risk narrative content here with sufficient length for extraction.</p></div>
<div><p>Legal and Administrative Proceedings</p><p>Proceedings narrative with enough text to qualify as a section body.</p></div>
<div><p>ITEM 5. OPERATING AND FINANCIAL REVIEW AND PROSPECTS</p><p>MD&A body text for operating review.</p></div>
<div><p>ITEM 11. QUANTITATIVE AND QUALITATIVE DISCLOSURES ABOUT MARKET RISK</p><p>Market risk disclosures.</p></div>
</body></html>
"""


def test_minimal_20f_html_extracts_risk_legal_mda_market_risk():
    result = parse_filing_section_index(_MINIMAL_20F_HTML.encode())
    ids = set(result["section_ids"])
    assert "risk-factors" in ids
    assert "legal-proceedings" in ids
    assert "mda" in ids
    assert "market-risk" in ids
