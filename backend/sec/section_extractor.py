"""In-memory HTML section extraction for SEC filings."""

from __future__ import annotations

import io
import re
import warnings
from typing import Any

from bs4 import BeautifulSoup, Tag, XMLParsedAsHTMLWarning

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

# Standard SEC disclosure sections mapped to anchor IDs
SECTION_DEFINITIONS: list[dict[str, Any]] = [
    {"id": "business", "label": "Item 1 — Business", "patterns": [r"item\s*1[\.\s—–-]*business", r"information\s*on\s*the\s*company"]},
    {"id": "risk-factors", "label": "Item 1A — Risk Factors", "patterns": [r"item\s*1a", r"^\d+\.[a-z]\s+risk\s*factors", r"^risk\s*factors"]},
    {"id": "unresolved-staff", "label": "Item 1B — Unresolved Staff Comments", "patterns": [r"item\s*1b"]},
    {"id": "properties", "label": "Item 2 — Properties", "patterns": [r"item\s*2[\.\s—–-]*properties"]},
    {"id": "legal-proceedings", "label": "Item 3 — Legal Proceedings", "patterns": [r"item\s*3[\.\s—–-]*legal"]},
    {"id": "mine-safety", "label": "Item 4 — Mine Safety", "patterns": [r"item\s*4[\.\s—–-]*mine", r"mine\s*safety"]},
    {"id": "mda", "label": "Item 7 — MD&A", "patterns": [r"item\s*7[\.\s—–-]*management", r"item\s*5[\.\s—–-]*operating", r"^management.s\s*discussion", r"^md&a$", r"^operating\s*and\s*financial\s*review"]},
    {"id": "market-risk", "label": "Item 7A — Market Risk", "patterns": [r"item\s*7a", r"quantitative.*qualitative.*market"]},
    {"id": "financial-statements", "label": "Item 8 — Financial Statements", "patterns": [r"item\s*8", r"financial\s*statements"]},
    {"id": "disagreements", "label": "Item 9 — Disagreements", "patterns": [r"item\s*9[\.\s—–-]*"]},
    {"id": "controls", "label": "Item 9A — Controls & Procedures", "patterns": [r"item\s*9a", r"controls\s*and\s*procedures"]},
    {"id": "other-info", "label": "Item 9B — Other Information", "patterns": [r"item\s*9b"]},
    {
        "id": "note-summary-policies",
        "label": "Note — Summary of Significant Accounting Policies",
        "patterns": [
            r"summary\s*of\s*significant\s*accounting",
            r"significant\s*accounting\s*polic",
            r"basis\s*of\s*presentation",
        ],
    },
    {"id": "note-revenue", "label": "Note — Revenue Recognition", "patterns": [r"revenue\s*recognition", r"note.*revenue"]},
    {"id": "note-segments", "label": "Note — Segment Information", "patterns": [r"segment\s*information", r"operating\s*segments", r"reportable\s*segments"]},
    {"id": "note-cash", "label": "Note — Cash & Cash Equivalents", "patterns": [r"cash\s*and\s*cash\s*equivalent", r"cash\s*equivalents"]},
    {
        "id": "note-investments",
        "label": "Note — Investments & Marketable Securities",
        "patterns": [r"marketable\s*securit", r"short.term\s*invest", r"investments?\s*in\s*marketable"],
    },
    {
        "id": "note-fair-value",
        "label": "Note — Fair Value Measurements",
        "patterns": [r"fair\s*value\s*measure", r"fair\s*value\s*hierarch"],
    },
    {
        "id": "note-receivables",
        "label": "Note — Accounts Receivable",
        "patterns": [r"accounts?\s*receivable", r"trade\s*receivable", r"allowance\s*for\s*doubtful"],
    },
    {"id": "note-inventory", "label": "Note — Inventory", "patterns": [r"^inventory$", r"inventor(y|ies)"]},
    {
        "id": "note-ppe",
        "label": "Note — Property, Plant & Equipment",
        "patterns": [r"property.*plant.*equipment", r"^ppe$", r"fixed\s*assets"],
    },
    {
        "id": "note-goodwill",
        "label": "Note — Goodwill & Intangible Assets",
        "patterns": [r"goodwill", r"intangible\s*assets?", r"acquired\s*intangible"],
    },
    {"id": "note-leases", "label": "Note — Leases", "patterns": [r"note.*lease", r"^leases$", r"lease\s*accounting"]},
    {"id": "note-debt", "label": "Note — Debt", "patterns": [r"note.*debt", r"long.term\s*debt", r"borrowings", r"credit\s*facilit"]},
    {
        "id": "note-derivatives",
        "label": "Note — Derivatives & Hedging",
        "patterns": [r"derivatives?", r"hedging\s*activit", r"hedge\s*accounting"],
    },
    {
        "id": "note-pension",
        "label": "Note — Pension & Postretirement Benefits",
        "patterns": [r"pension", r"postretirement", r"defined\s*benefit", r"employee\s*benefit\s*plans?"],
    },
    {"id": "note-income-tax", "label": "Note — Income Taxes", "patterns": [r"income\s*tax", r"note.*tax", r"deferred\s*tax"]},
    {"id": "note-stock-comp", "label": "Note — Stock-Based Compensation", "patterns": [r"stock.based\s*compensation", r"share.based", r"equity.based\s*compensation"]},
    {
        "id": "note-equity",
        "label": "Note — Stockholders' Equity",
        "patterns": [r"stockholders?.?\s*equity", r"shareholders?.?\s*equity", r"stockholders?.?\s*deficit"],
    },
    {"id": "note-eps", "label": "Note — Earnings Per Share", "patterns": [r"earnings\s*per\s*share", r"^eps$", r"diluted\s*eps"]},
    {
        "id": "note-aoci",
        "label": "Note — Accumulated Other Comprehensive Income",
        "patterns": [r"accumulated\s*other\s*comprehensive", r"other\s*comprehensive\s*income", r"^aoci$"],
    },
    {"id": "note-restructuring", "label": "Note — Restructuring", "patterns": [r"restructur", r"severance\s*and\s*restructur"]},
    {"id": "note-impairment", "label": "Note — Impairment", "patterns": [r"impairment", r"asset\s*impairment"]},
    {
        "id": "note-acquisitions",
        "label": "Note — Business Combinations & Acquisitions",
        "patterns": [r"business\s*combination", r"acquisition", r"purchase\s*accounting"],
    },
    {"id": "note-software", "label": "Note — Software & Capitalization", "patterns": [r"software\s*development", r"capitalized\s*software", r"internal.use\s*software"]},
    {"id": "note-related-party", "label": "Note — Related Party Transactions", "patterns": [r"related\s*party", r"related.party\s*transaction"]},
    {"id": "note-contingencies", "label": "Note — Commitments & Contingencies", "patterns": [r"commitments\s*and\s*contingenc", r"contingenc"]},
    {"id": "note-subsequent-events", "label": "Note — Subsequent Events", "patterns": [r"subsequent\s*events?", r"events?\s*subsequent"]},
    {
        "id": "note-recent-standards",
        "label": "Note — Recent Accounting Pronouncements",
        "patterns": [
            r"recent\s*accounting\s*pronouncement",
            r"recently\s*adopted\s*accounting",
            r"new\s*accounting\s*standard",
            r"accounting\s*pronouncement",
        ],
    },
]

_ITEM_HEADER = re.compile(r"^\s*item\s+(\d+[a-z]?)\b", re.IGNORECASE)
_NOTE_HEADER = re.compile(r"^\s*note\s+(\d+)\b", re.IGNORECASE)
_ITEM_IDS = {
    "1": "business",
    "1a": "risk-factors",
    "1b": "unresolved-staff",
    "2": "properties",
    "3": "legal-proceedings",
    "4": "mine-safety",
    "7": "mda",
    "7a": "market-risk",
    "8": "financial-statements",
    "9": "disagreements",
    "9a": "controls",
    "9b": "other-info",
}
# Item numbers differ between 10-K and 10-Q; resolve using the subtitle when present.
_ITEM_SUBTITLE_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"operating\s*and\s*financial\s*review", re.IGNORECASE), "mda"),
    (re.compile(r"information\s*on\s*the\s*company", re.IGNORECASE), "business"),
    (re.compile(r"management.s\s*discussion|md&a", re.IGNORECASE), "mda"),
    (re.compile(r"risk\s*factors", re.IGNORECASE), "risk-factors"),
    (re.compile(r"financial\s*statements", re.IGNORECASE), "financial-statements"),
    (re.compile(r"legal\s*proceed", re.IGNORECASE), "legal-proceedings"),
    (re.compile(r"quantitative.*qualitative.*market|market\s*risk", re.IGNORECASE), "market-risk"),
    (re.compile(r"controls\s*and\s*procedures", re.IGNORECASE), "controls"),
    (re.compile(r"unresolved\s*staff", re.IGNORECASE), "unresolved-staff"),
    (re.compile(r"mine\s*safety", re.IGNORECASE), "mine-safety"),
    (re.compile(r"\bbusiness\b", re.IGNORECASE), "business"),
    (re.compile(r"\bproperties\b", re.IGNORECASE), "properties"),
]
_MAX_HEADING_CHARS = 220

_OPTIONAL_SECTION_IDS = frozenset({"unresolved-staff", "other-info", "disagreements", "mine-safety"})

_MAJOR_SECTION_IDS = frozenset({
    "business",
    "risk-factors",
    "unresolved-staff",
    "properties",
    "legal-proceedings",
    "mine-safety",
    "mda",
    "market-risk",
    "financial-statements",
    "disagreements",
    "controls",
    "other-info",
})

# Major narrative sections (no XBRL fast path) — plain text default in the UI.
NARRATIVE_SECTION_IDS = _MAJOR_SECTION_IDS - {"financial-statements"}

_BLOCK_TAGS = frozenset({"div", "p", "table", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "td"})


def _compile_patterns() -> list[tuple[str, str, re.Pattern]]:
    compiled = []
    for section in SECTION_DEFINITIONS:
        for pattern in section["patterns"]:
            compiled.append((section["id"], section["label"], re.compile(pattern, re.IGNORECASE)))
    return compiled


_COMPILED = _compile_patterns()


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def _section_label(section_id: str) -> str:
    return next(s["label"] for s in SECTION_DEFINITIONS if s["id"] == section_id)


_AMBIGUOUS_ITEM_SUBTITLES: dict[str, re.Pattern[str]] = {
    "properties": re.compile(r"properties", re.IGNORECASE),
    "legal-proceedings": re.compile(r"legal\s*proceed", re.IGNORECASE),
    "mine-safety": re.compile(r"mine\s*safety", re.IGNORECASE),
    "unresolved-staff": re.compile(r"unresolved\s*staff", re.IGNORECASE),
    "other-info": re.compile(r"other\s*information", re.IGNORECASE),
    "disagreements": re.compile(r"disagreements", re.IGNORECASE),
}


def _resolve_item_section(item_num: str, head: str) -> tuple[str, str] | None:
    for pattern, section_id in _ITEM_SUBTITLE_RULES:
        if pattern.search(head):
            return section_id, _section_label(section_id)
    section_id = _ITEM_IDS.get(item_num.lower())
    if section_id:
        if section_id == "business" and not re.search(
            r"business|information on the company", head, re.IGNORECASE
        ):
            return None
        subtitle = _AMBIGUOUS_ITEM_SUBTITLES.get(section_id)
        if subtitle and not subtitle.search(head):
            return None
        return section_id, _section_label(section_id)
    return None


def _match_section(text: str) -> tuple[str, str] | None:
    cleaned = _normalize_text(text)
    if len(cleaned) < 3:
        return None

    head = cleaned[:_MAX_HEADING_CHARS]

    item_match = _ITEM_HEADER.match(head)
    if item_match:
        resolved = _resolve_item_section(item_match.group(1), head)
        if resolved:
            return resolved

    note_match = _NOTE_HEADER.match(head)
    if note_match:
        for section_id, label, pattern in _COMPILED:
            if section_id.startswith("note-") and pattern.search(head):
                return section_id, label

    if len(cleaned) > _MAX_HEADING_CHARS:
        return None

    if re.match(r"^see\s+accompanying\b", cleaned, re.IGNORECASE):
        return None

    if re.match(r"^refer\s+to\b", cleaned, re.IGNORECASE):
        return None

    if re.match(r"^of\s+", cleaned, re.IGNORECASE):
        return None

    if "," in cleaned[:50] and not item_match:
        return None

    subitem_risk = re.match(r"^\s*([A-Za-z])\.\s*(RISK\s+FACTORS|risk\s+factors)", head, re.IGNORECASE)
    if subitem_risk:
        return "risk-factors", _section_label("risk-factors")

    for section_id, label, pattern in _COMPILED:
        if section_id.startswith("note-"):
            if pattern.search(head):
                return section_id, label
        elif pattern.search(head):
            if section_id in _MAJOR_SECTION_IDS and not pattern.match(head) and not item_match:
                continue
            return section_id, label
    return None


def _is_section_heading(text: str) -> bool:
    cleaned = _normalize_text(text)
    if len(cleaned) < 3:
        return False
    if _ITEM_HEADER.match(cleaned) or _NOTE_HEADER.match(cleaned):
        return len(cleaned) <= _MAX_HEADING_CHARS
    return len(cleaned) <= 150


def _heading_text(element: Tag) -> str:
    if element.name in ("h1", "h2", "h3", "h4", "h5", "h6", "b", "strong", "p", "div", "span", "font", "td", "th"):
        return _normalize_text(element.get_text(" ", strip=True))
    return ""


def _block_ancestor(tag: Tag) -> Tag:
    block_names = {
        "p", "div", "td", "th", "li", "h1", "h2", "h3", "h4", "h5", "h6",
        "table", "section", "article", "tr",
    }
    current: Tag | None = tag
    chosen = tag
    while current and current.name not in ("body", "html", "[document]"):
        if current.name in block_names:
            chosen = current
            if current.name in ("div", "td", "p", "section", "article", "table"):
                break
        current = current.parent  # type: ignore[assignment]
    return chosen


def _build_block_index(root: Tag) -> tuple[list[Tag], dict[int, int]]:
    blocks = [t for t in root.find_all(_BLOCK_TAGS)]
    index = {id(t): i for i, t in enumerate(blocks)}
    return blocks, index


_block_start_cache: dict[int, int] = {}


def _block_start_index(block: Tag, blocks: list[Tag], block_index: dict[int, int]) -> int:
    block_id = id(block)
    cached = _block_start_cache.get(block_id)
    if cached is not None:
        return cached
    if block_id in block_index:
        _block_start_cache[block_id] = block_index[block_id]
        return block_index[block_id]
    for i, candidate in enumerate(blocks):
        if block is candidate:
            _block_start_cache[block_id] = i
            return i
    _block_start_cache[block_id] = 0
    return 0


def _find_headings(blocks: list[Tag], block_index: dict[int, int]) -> list[tuple[Tag, str, str, str]]:
    headings: list[tuple[Tag, str, str, str, int]] = []
    seen_blocks: set[int] = set()

    for block in blocks:
        text = _heading_text(block)
        if not text:
            continue
        match = _match_section(text)
        if not match or not _is_section_heading(text):
            continue
        section_id, label = match
        block_id = id(block)
        if block_id in seen_blocks:
            continue
        seen_blocks.add(block_id)
        order = block_index.get(block_id, 0)
        headings.append((block, text[:_MAX_HEADING_CHARS], section_id, label, order))

    headings.sort(key=lambda h: h[4])
    return [(h[0], h[1], h[2], h[3]) for h in headings]


def _strip_heavy_markup(soup: BeautifulSoup) -> None:
    for tag in soup(["script", "style", "noscript", "meta", "link", "svg", "iframe"]):
        tag.decompose()


def _table_row_ancestor(tag: Tag) -> Tag | None:
    current: Tag | None = tag
    while current and current.name not in ("body", "html", "[document]"):
        if current.name == "tr":
            return current
        current = current.parent  # type: ignore[assignment]
    return None


def _anchor_link_context(link: Tag) -> str:
    """Row/cell text for a TOC anchor link (Item number + subtitle)."""
    row = _table_row_ancestor(link)
    if row:
        text = _normalize_text(row.get_text(" ", strip=True))
        if len(text) >= 5:
            return text
    parent = link.parent
    if isinstance(parent, Tag) and parent.name in ("td", "div", "span", "p", "th"):
        text = _normalize_text(parent.get_text(" ", strip=True))
        if len(text) >= 5:
            return text
    return _normalize_text(link.get_text(" ", strip=True))


def _match_toc_section(text: str) -> tuple[str, str] | None:
    """Looser section match for TOC rows that lead with item numbers (e.g. 20-F '11 Market Risk')."""
    cleaned = _normalize_text(text)
    stripped = re.sub(r"^\d+[A-Za-z]?\.?\s+", "", cleaned)
    for candidate in (stripped, cleaned):
        match = _match_section(candidate)
        if match:
            return match
    head = stripped[:_MAX_HEADING_CHARS]
    for section_id, label, pattern in _COMPILED:
        if section_id.startswith("note-"):
            continue
        if section_id in _MAJOR_SECTION_IDS and pattern.search(head):
            return section_id, label
    return None


def _extract_toc_anchors(root: Tag) -> dict[str, str]:
    """Map section ids to in-document fragment ids from the filing table of contents."""
    anchors: dict[str, str] = {}
    for link in root.find_all("a", href=True):
        href = link.get("href", "")
        if not isinstance(href, str) or not href.startswith("#"):
            continue
        fragment = href[1:].strip()
        if not fragment:
            continue
        context = _anchor_link_context(link)
        if len(context) < 3:
            continue
        match = _match_toc_section(context)
        if not match:
            continue
        section_id, _ = match
        if section_id == "business" and not re.search(
            r"item\s*1\b|information on the company", context, re.IGNORECASE
        ):
            continue
        if section_id not in anchors:
            anchors[section_id] = fragment
    return anchors


def _fuzzy_toc_anchor(root: Tag, heading_text: str, section_id: str) -> str | None:
    """Match TOC links when heading text aligns but strict section rules missed."""
    needle = _normalize_text(heading_text).lower()
    if len(needle) < 8:
        return None
    for link in root.find_all("a", href=True):
        href = link.get("href", "")
        if not isinstance(href, str) or not href.startswith("#"):
            continue
        fragment = href[1:].strip()
        if not fragment:
            continue
        context = _anchor_link_context(link).lower()
        if needle not in context and context not in needle:
            continue
        match = _match_section(context)
        if match and match[0] == section_id:
            return fragment
    return None


def _anchor_for_heading_text(root: Tag, heading_text: str) -> str | None:
    """Locate nearest in-document id for an extracted section heading string."""
    needle = _normalize_text(heading_text).lower()
    if len(needle) < 8:
        return None
    for text_node in root.find_all(string=True):
        if not text_node or needle not in _normalize_text(str(text_node)).lower():
            continue
        parent = text_node.parent
        if not isinstance(parent, Tag):
            continue
        parent_text = _normalize_text(parent.get_text(" ", strip=True))
        if needle not in parent_text.lower():
            continue
        if len(parent_text) > len(needle) + 80:
            continue
        for finder in (parent.find_all_previous, parent.find_all_next):
            for elem in finder(id=True, limit=8):
                element_id = elem.get("id")
                if element_id and len(str(element_id)) > 4:
                    return str(element_id)
    return None


def _heading_anchor(block: Tag) -> str | None:
    """Nearest element id/name on a section heading block."""
    for tag in [block, *block.parents]:
        if not isinstance(tag, Tag):
            continue
        element_id = tag.get("id")
        if element_id:
            return str(element_id)
        name = tag.get("name")
        if name:
            return str(name)
    for descendant in block.find_all(id=True, limit=5):
        element_id = descendant.get("id")
        if element_id:
            return str(element_id)
    for tag in block.find_all_previous(True, limit=30):
        if not isinstance(tag, Tag):
            continue
        element_id = tag.get("id")
        if element_id and len(str(element_id)) > 4:
            return str(element_id)
    for tag in block.find_all_next(True, limit=30):
        if not isinstance(tag, Tag):
            continue
        element_id = tag.get("id")
        if element_id and len(str(element_id)) > 4:
            return str(element_id)
    return None


def _resolve_section_anchor(
    section_id: str,
    heading_block: Tag,
    toc_anchors: dict[str, str],
    root: Tag | None = None,
    heading_text: str | None = None,
) -> str | None:
    if section_id in toc_anchors:
        return toc_anchors[section_id]
    anchor = _heading_anchor(heading_block)
    if anchor:
        return anchor
    if root is not None and heading_text:
        fuzzy = _fuzzy_toc_anchor(root, heading_text, section_id)
        if fuzzy:
            return fuzzy
        text_anchor = _anchor_for_heading_text(root, heading_text)
        if text_anchor:
            return text_anchor
    return None


def _extract_table_rows(start: Tag, end: Tag | None) -> str | None:
    start_row = _table_row_ancestor(start)
    if not start_row:
        return None
    end_row = _table_row_ancestor(end) if end else None

    parts: list[str] = []
    row: Tag | None = start_row
    while row:
        if end_row and row is end_row:
            break
        parts.append(str(row))
        row = row.find_next_sibling("tr")
    html = "".join(parts)
    return html if len(re.sub(r"<[^>]+>", " ", html)) > 300 else None


def _item_number(text: str) -> str | None:
    match = _ITEM_HEADER.match(_normalize_text(text))
    return match.group(1).lower() if match else None


def _find_section_end(
    headings: list[tuple[Tag, str, str, str]],
    start_i: int,
    blocks: list[Tag],
    block_index: dict[int, int],
) -> Tag | None:
    """Next real Item/Note boundary — skip in-body false positives between sections."""
    start_block, start_text, start_id, _ = headings[start_i]
    start_idx = _block_start_index(start_block, blocks, block_index)
    start_item = _item_number(start_text)

    for j in range(start_i + 1, len(headings)):
        end_block, end_text, end_id, _ = headings[j]
        end_idx = _block_start_index(end_block, blocks, block_index)
        if end_idx <= start_idx:
            continue
        cleaned = _normalize_text(end_text)

        if _ITEM_HEADER.match(cleaned):
            end_item = _item_number(cleaned)
            if start_item and end_item == start_item:
                continue
            if end_id == start_id:
                continue
            return end_block

        if _NOTE_HEADER.match(cleaned):
            if start_id.startswith("note-") or end_id.startswith("note-"):
                return end_block
            continue

        if end_id != start_id and end_id in _MAJOR_SECTION_IDS and end_idx - start_idx > 40:
            return end_block

    return None


def _outermost_blocks(slice_blocks: list[Tag]) -> list[Tag]:
    if not slice_blocks:
        return []
    if len(slice_blocks) == 1:
        return slice_blocks

    slice_set = set(slice_blocks)
    outer: list[Tag] = []
    for block in slice_blocks:
        if any(parent in slice_set for parent in block.parents):
            continue
        outer.append(block)
    return outer if outer else slice_blocks


def _extract_between(
    start: Tag,
    end: Tag | None,
    blocks: list[Tag],
    block_index: dict[int, int],
) -> str:
    table_html = _extract_table_rows(start, end)
    if table_html:
        return table_html

    start_i = _block_start_index(start, blocks, block_index)
    end_i = _block_start_index(end, blocks, block_index) if end else len(blocks)
    if end_i <= start_i:
        end_i = len(blocks)

    slice_blocks = blocks[start_i:end_i]
    if not slice_blocks:
        return str(start)

    outer = _outermost_blocks(slice_blocks)
    html = "".join(str(b) for b in outer)
    return html if html else str(start)


def _text_len(html: str) -> int:
    if len(html) < 8000:
        return len(BeautifulSoup(html, "lxml").get_text(" ", strip=True))
    return len(re.sub(r"<[^>]+>", " ", html))


def _text_preview(html: str) -> str:
    if len(html) < 8000:
        text = BeautifulSoup(html, "lxml").get_text(" ", strip=True)
    else:
        text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text)[:500]


def _html_to_plain_text(html: str) -> str:
    """Convert section HTML to readable plain text with paragraph breaks."""
    if not html:
        return ""
    soup = BeautifulSoup(html, "lxml")
    for br in soup.find_all("br"):
        br.replace_with("\n")
    for tag in soup.find_all(["p", "div", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th"]):
        if tag.string or tag.contents:
            tag.append("\n\n")
    text = soup.get_text(separator="", strip=False)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _prepare_filing_structure(html_bytes: bytes) -> dict[str, Any]:
    """Parse HTML once and locate section boundaries (no HTML extraction)."""
    _block_start_cache.clear()
    stream = io.BytesIO(html_bytes)
    soup = BeautifulSoup(stream, "html.parser")
    _strip_heavy_markup(soup)
    root = soup.find("body") or soup

    blocks, block_index = _build_block_index(root)
    headings = _find_headings(blocks, block_index)
    toc_anchors = _extract_toc_anchors(root)

    if not headings:
        body = root
        text = body.get_text(" ", strip=True)[:5000] if body else ""
        return {
            "full_document": True,
            "root": root,
            "body_text": text,
            "blocks": blocks,
            "block_index": block_index,
            "headings": [],
            "section_ends": [],
            "best_meta": {},
            "toc_anchors": toc_anchors,
        }

    best_meta: dict[str, tuple[int, int, str, str, int]] = {}
    section_ends: list[Tag | None] = [
        _find_section_end(headings, i, blocks, block_index) for i in range(len(headings))
    ]

    for i, (start_block, heading_text, section_id, label) in enumerate(headings):
        end_block = section_ends[i]
        start_i = _block_start_index(start_block, blocks, block_index)
        end_i = _block_start_index(end_block, blocks, block_index) if end_block else len(blocks)
        span = max(end_i - start_i, 1)
        order = start_i

        existing = best_meta.get(section_id)
        if existing is None or span > existing[0]:
            best_meta[section_id] = (span, i, heading_text, label, order)

    return {
        "full_document": False,
        "root": root,
        "body_text": "",
        "blocks": blocks,
        "block_index": block_index,
        "headings": headings,
        "section_ends": section_ends,
        "best_meta": best_meta,
        "toc_anchors": toc_anchors,
    }


def _sections_from_structure(structure: dict[str, Any], *, include_html: bool) -> list[dict[str, Any]]:
    if structure.get("full_document"):
        root = structure["root"]
        text = structure["body_text"]
        html_content = str(root)[:500000] if root else ""
        return [{
            "id": "full-document",
            "label": "Full Document",
            "heading": "Full Filing",
            "html": html_content if include_html else "",
            "text_preview": text[:500],
        }]

    headings = structure["headings"]
    blocks = structure["blocks"]
    block_index = structure["block_index"]
    section_ends = structure["section_ends"]
    best_meta = structure["best_meta"]
    toc_anchors = structure.get("toc_anchors") or {}
    root = structure.get("root")

    best_by_id: dict[str, dict[str, Any]] = {}
    for section_id, (_span, i, heading_text, label, order) in best_meta.items():
        start_block = headings[i][0]
        anchor = _resolve_section_anchor(
            section_id, start_block, toc_anchors, root=root, heading_text=heading_text
        )
        entry: dict[str, Any] = {
            "id": section_id,
            "label": label,
            "heading": heading_text,
            "anchor": anchor,
            "html": "",
            "text_preview": heading_text[:500],
            "_order": order,
        }
        if include_html:
            end_block = section_ends[i]
            html_content = _extract_between(start_block, end_block, blocks, block_index)
            entry["html"] = html_content
            entry["text_preview"] = _text_preview(html_content)
        if section_id in _OPTIONAL_SECTION_IDS and not anchor:
            continue
        best_by_id[section_id] = entry

    sections = sorted(best_by_id.values(), key=lambda s: s["_order"])
    for s in sections:
        del s["_order"]
    return sections


def parse_filing_section_index(html_bytes: bytes) -> dict[str, Any]:
    """Fast path: section metadata only (no per-section HTML extraction)."""
    structure = _prepare_filing_structure(html_bytes)
    sections = _sections_from_structure(structure, include_html=False)
    return {
        "sections": sections,
        "section_ids": [s["id"] for s in sections],
    }


def extract_section_html(
    html_bytes: bytes,
    section_id: str,
    structure: dict[str, Any] | None = None,
) -> str | None:
    """Extract HTML for a single section on demand."""
    if structure is None:
        structure = _prepare_filing_structure(html_bytes)
    if structure.get("full_document"):
        if section_id == "full-document":
            root = structure["root"]
            return str(root)[:500000] if root else ""
        return None

    headings = structure["headings"]
    blocks = structure["blocks"]
    block_index = structure["block_index"]
    section_ends = structure["section_ends"]
    best_meta = structure["best_meta"]

    meta = best_meta.get(section_id)
    if not meta:
        return None

    _span, i, _heading_text, _label, _order = meta
    start_block = headings[i][0]
    end_block = section_ends[i]
    return _extract_between(start_block, end_block, blocks, block_index)


def extract_section_text(
    html_bytes: bytes,
    section_id: str,
    structure: dict[str, Any] | None = None,
) -> str | None:
    """Extract plain text for a single section (reuses structure cache)."""
    if structure is None:
        structure = _prepare_filing_structure(html_bytes)
    if structure.get("full_document"):
        if section_id == "full-document":
            return structure.get("body_text", "")[:500000]
        return None

    html = extract_section_html(html_bytes, section_id, structure)
    if not html:
        return None
    return _html_to_plain_text(html)


def parse_filing_sections(html_bytes: bytes) -> dict[str, Any]:
    """Parse filing HTML into sections from heading to next heading."""
    structure = _prepare_filing_structure(html_bytes)
    sections = _sections_from_structure(structure, include_html=True)
    return {
        "sections": sections,
        "section_ids": [s["id"] for s in sections],
    }


def get_section_catalog() -> list[dict[str, str]]:
    seen: set[str] = set()
    catalog = []
    for section in SECTION_DEFINITIONS:
        if section["id"] not in seen:
            seen.add(section["id"])
            catalog.append({"id": section["id"], "label": section["label"]})
    return catalog
