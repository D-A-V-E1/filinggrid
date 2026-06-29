"""6-K report exhibit selection for section indexing."""

from sec.client import _html_financial_score


def test_html_financial_score_prefers_consolidated_exhibit():
    cover = b"<html><body><p>Form 6-K cover page</p></body></html>"
    exhibit = b"""
    <html><body>
    <p>Consolidated Financial Statements</p>
    <p>Revenue and net income for the quarter</p>
    <p>Total assets and cash equivalents</p>
    </body></html>
    """
    assert _html_financial_score(exhibit) > _html_financial_score(cover)
