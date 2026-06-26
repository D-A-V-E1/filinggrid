"""Tests for SEC filing excerpt HTML normalization."""

from sec.section_extractor import _normalize_excerpt_html


def test_unwraps_spans_and_inserts_word_spacing():
    html = (
        "<div><span>Accounts</span><span>receivable</span>, "
        "<span>net</span></div>"
    )
    normalized = _normalize_excerpt_html(html)
    assert "Accounts receivable" in normalized
    assert ", net" in normalized or " net" in normalized
    assert "<span" not in normalized


def test_unwraps_ixbrl_tags():
    html = (
        '<p><ix:nonNumeric name="us-gaap:ReceivablesTextBlock">'
        "<span>Trade</span><span>receivables</span>"
        "</ix:nonNumeric></p>"
    )
    normalized = _normalize_excerpt_html(html)
    assert "Trade receivables" in normalized


def test_normalizes_table_cells():
    html = (
        "<table><tr>"
        "<td><span>$</span><span>1,234</span></td>"
        "<td><span>$</span><span>567</span></td>"
        "</tr></table>"
    )
    normalized = _normalize_excerpt_html(html)
    assert "$ 1,234" in normalized or "$1,234" in normalized
    assert "<table>" in normalized
    assert "567" in normalized


def test_wraps_bare_table_rows():
    html = (
        "<tr><td><span>Line</span><span>one</span></td></tr>"
        "<tr><td><span>Line</span><span>two</span></td></tr>"
    )
    normalized = _normalize_excerpt_html(html)
    assert normalized.startswith("<table>")
    assert "Line one" in normalized
    assert "Line two" in normalized
