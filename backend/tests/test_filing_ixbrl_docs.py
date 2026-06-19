"""Tests for 6-K exhibit iXBRL document discovery."""

from sec.client import _html_has_ixbrl_facts, _rank_ixbrl_document_candidates


def test_rank_ixbrl_document_candidates_prefers_consolidated_report():
    items = [
        {"name": "tsm-fsx20260515x6k.htm", "size": "17095"},
        {"name": "a2026q1consolidatedreport-.htm", "size": "4299581"},
        {"name": "0001046179-26-000278-index.html", "size": "1000"},
    ]
    ranked = _rank_ixbrl_document_candidates(items, "tsm-fsx20260515x6k.htm")
    assert ranked[0] == "a2026q1consolidatedreport-.htm"


def test_html_has_ixbrl_facts_detects_nonfraction():
    assert _html_has_ixbrl_facts(b'<ix:nonFraction name="ifrs-full:Revenue">1</ix:nonFraction>')
    assert not _html_has_ixbrl_facts(b"<html><body>No tags</body></html>")
