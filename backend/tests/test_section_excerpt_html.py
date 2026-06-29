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
    assert "filing-table-wrap" in normalized
    assert "<table>" in normalized
    assert "567" in normalized


def test_wraps_bare_table_rows():
    html = (
        "<tr><td><span>Line</span><span>one</span></td></tr>"
        "<tr><td><span>Line</span><span>two</span></td></tr>"
    )
    normalized = _normalize_excerpt_html(html)
    assert normalized.startswith('<div class="filing-table-wrap"><table>')
    assert "Line one" in normalized
    assert "Line two" in normalized


def test_wraps_orphan_rows_inside_div():
    html = (
        "<div>"
        "<tr><td>Revenue</td><td align=\"right\">$100</td></tr>"
        "<tr><td>Cost</td><td align=\"right\">$40</td></tr>"
        "</div>"
    )
    normalized = _normalize_excerpt_html(html)
    assert "filing-table-wrap" in normalized
    assert normalized.count("<table>") == 1
    assert 'align="right"' in normalized
    assert "Revenue" in normalized
    assert "$100" in normalized


def test_unwraps_div_wrappers_in_cells():
    html = (
        "<table><tr>"
        '<td align="right"><div><span>$</span><span>26,974</span></div></td>'
        "</tr></table>"
    )
    normalized = _normalize_excerpt_html(html)
    assert "filing-table-wrap" in normalized
    assert "<table>" in normalized
    assert "<div><div" not in normalized
    assert 'align="right"' in normalized
    assert "26,974" in normalized


def test_preserves_colspan_and_strips_inline_styles():
    html = (
        '<table><tr>'
        '<td colspan="3" style="display:none;border:1px solid">Header</td>'
        "</tr><tr>"
        '<td style="width:100px">A</td>'
        '<td align="right" style="text-align:right">$1</td>'
        "</tr></table>"
    )
    normalized = _normalize_excerpt_html(html)
    assert 'colspan="3"' in normalized
    assert "style=" not in normalized
    assert 'align="right"' in normalized
    assert "display:none" not in normalized


def test_preserves_br_as_paragraph_breaks():
    html = "<div>First paragraph<br><br>Second paragraph</div>"
    normalized = _normalize_excerpt_html(html)
    assert "First paragraph" in normalized
    assert "Second paragraph" in normalized
    assert "paragraph Second" not in normalized.replace("\n", " ").replace("  ", " ")


def test_realistic_ixbrl_table_fragment():
    """Realistic iXBRL table fragment with ix tags, spans, and numeric columns."""
    html = (
        "<div>"
        '<table style="display:none">'
        "<tr>"
        '<td><span>Jan</span><span>28,</span><span>2024</span></td>'
        '<td align="right"><ix:nonFraction name="us-gaap:Revenue" '
        'format="ixt:num-dot-decimal" scale="6" decimals="-6">'
        "<span>60,922</span></ix:nonFraction></td>"
        '<td align="right"><ix:nonFraction name="us-gaap:Revenue" '
        'format="ixt:num-dot-decimal" scale="6" decimals="-6">'
        "<span>26,974</span></ix:nonFraction></td>"
        "</tr>"
        "<tr>"
        "<td><span>Gross</span><span>margin</span></td>"
        '<td align="right"><span>72.7</span><span>%</span></td>'
        '<td align="right"><span>64.9</span><span>%</span></td>'
        "</tr>"
        "</table>"
        "</div>"
    )
    normalized = _normalize_excerpt_html(html)
    assert "filing-table-wrap" in normalized
    assert "Jan 28, 2024" in normalized or "Jan 28 , 2024" in normalized
    assert "Gross margin" in normalized
    assert "60,922" in normalized
    assert "26,974" in normalized
    assert "72.7" in normalized and "%" in normalized
    assert normalized.count('align="right"') >= 4
    assert "<ix:" not in normalized
    assert "style=" not in normalized


def test_strips_page_number_and_toc_noise_rows():
    html = (
        "<table>"
        "<tr><td>5</td></tr>"
        "<tr><td>Table of Contents</td></tr>"
        "<tr><td>Cash and cash equivalents</td><td align=\"right\">$1,234</td></tr>"
        "<tr><td colspan=\"2\">See accompanying notes to consolidated financial statements.</td></tr>"
        "</table>"
    )
    normalized = _normalize_excerpt_html(html)
    assert "Cash and cash equivalents" in normalized
    assert "$1,234" in normalized
    assert "Table of Contents" not in normalized
    assert "<td>5</td>" not in normalized
    assert "See accompanying notes" not in normalized


def test_preserves_narrative_paragraphs_with_see_accompanying_phrase():
    html = (
        "<div>"
        "<p>Our consolidated balance sheets are prepared in accordance with GAAP. "
        "See accompanying notes for additional detail on accounting policies.</p>"
        "</div>"
    )
    normalized = _normalize_excerpt_html(html)
    assert "See accompanying notes" in normalized
