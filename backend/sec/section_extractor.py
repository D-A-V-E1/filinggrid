"""In-memory HTML section extraction for SEC filings."""

from __future__ import annotations

import io
import re
from typing import Any

from bs4 import BeautifulSoup, NavigableString, Tag

# Standard SEC disclosure sections mapped to anchor IDs
SECTION_DEFINITIONS: list[dict[str, Any]] = [
    {"id": "business", "label": "Item 1 — Business", "patterns": [r"item\s*1[\.\s—–-]*business", r"^business$"]},
    {"id": "risk-factors", "label": "Item 1A — Risk Factors", "patterns": [r"item\s*1a", r"risk\s*factors"]},
    {"id": "unresolved-staff", "label": "Item 1B — Unresolved Staff Comments", "patterns": [r"item\s*1b"]},
    {"id": "properties", "label": "Item 2 — Properties", "patterns": [r"item\s*2[\.\s—–-]*properties"]},
    {"id": "legal-proceedings", "label": "Item 3 — Legal Proceedings", "patterns": [r"item\s*3[\.\s—–-]*legal"]},
    {"id": "mine-safety", "label": "Item 4 — Mine Safety", "patterns": [r"item\s*4"]},
    {"id": "mda", "label": "Item 7 — MD&A", "patterns": [r"item\s*7[\.\s—–-]*management", r"management.s\s*discussion", r"^md&a$"]},
    {"id": "market-risk", "label": "Item 7A — Market Risk", "patterns": [r"item\s*7a", r"quantitative.*qualitative.*market"]},
    {"id": "financial-statements", "label": "Item 8 — Financial Statements", "patterns": [r"item\s*8", r"financial\s*statements"]},
    {"id": "disagreements", "label": "Item 9 — Disagreements", "patterns": [r"item\s*9[\.\s—–-]*"]},
    {"id": "controls", "label": "Item 9A — Controls & Procedures", "patterns": [r"item\s*9a", r"controls\s*and\s*procedures"]},
    {"id": "other-info", "label": "Item 9B — Other Information", "patterns": [r"item\s*9b"]},
    {"id": "note-revenue", "label": "Note — Revenue Recognition", "patterns": [r"revenue\s*recognition", r"note.*revenue"]},
    {"id": "note-segments", "label": "Note — Segment Information", "patterns": [r"segment\s*information", r"operating\s*segments"]},
    {"id": "note-debt", "label": "Note — Debt", "patterns": [r"note.*debt", r"long.term\s*debt"]},
    {"id": "note-leases", "label": "Note — Leases", "patterns": [r"note.*lease", r"^leases$"]},
    {"id": "note-income-tax", "label": "Note — Income Taxes", "patterns": [r"income\s*tax", r"note.*tax"]},
    {"id": "note-stock-comp", "label": "Note — Stock-Based Compensation", "patterns": [r"stock.based\s*compensation", r"share.based"]},
    {"id": "note-software", "label": "Note — Software & Capitalization", "patterns": [r"software\s*development", r"capitalized\s*software", r"internal.use\s*software"]},
    {"id": "note-contingencies", "label": "Note — Commitments & Contingencies", "patterns": [r"commitments\s*and\s*contingenc", r"legal\s*proceedings.*note"]},
]


def _compile_patterns() -> list[tuple[str, str, re.Pattern]]:
    compiled = []
    for section in SECTION_DEFINITIONS:
        for pattern in section["patterns"]:
            compiled.append((section["id"], section["label"], re.compile(pattern, re.IGNORECASE)))
    return compiled


_COMPILED = _compile_patterns()


def _match_section(text: str) -> tuple[str, str] | None:
    cleaned = re.sub(r"\s+", " ", text.strip())[:200]
    if len(cleaned) < 3:
        return None
    for section_id, label, pattern in _COMPILED:
        if pattern.search(cleaned):
            return section_id, label
    return None


def _heading_text(element: Tag) -> str:
    if element.name in ("h1", "h2", "h3", "h4", "h5", "h6", "b", "strong", "p", "div", "span", "font"):
        text = element.get_text(" ", strip=True)
        return text[:300]
    return ""


def _find_headings(soup: BeautifulSoup) -> list[tuple[Tag, str]]:
    headings: list[tuple[Tag, str]] = []
    for tag in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "b", "strong", "p", "div"]):
        text = _heading_text(tag)
        if text and len(text) < 200 and _match_section(text):
            headings.append((tag, text))
    return headings


def _extract_between(start: Tag, end: Tag | None, soup: BeautifulSoup) -> str:
    parts: list[str] = []
    current = start
    while current:
        if end and current is end:
            break
        if isinstance(current, Tag):
            parts.append(str(current))
        current = current.next_element
        if end is None and current and isinstance(current, Tag) and current.name in ("h1", "h2", "h3"):
            break
    return "".join(parts)


def parse_filing_sections(html_bytes: bytes) -> dict[str, Any]:
    """Parse filing HTML entirely in memory via streaming byte buffer."""
    stream = io.BytesIO(html_bytes)
    soup = BeautifulSoup(stream, "lxml")

    for tag in soup(["script", "style", "noscript", "meta", "link"]):
        tag.decompose()

    headings = _find_headings(soup)
    sections: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for i, (tag, heading_text) in enumerate(headings):
        match = _match_section(heading_text)
        if not match:
            continue
        section_id, label = match
        if section_id in seen_ids:
            continue
        seen_ids.add(section_id)
        end_tag = headings[i + 1][0] if i + 1 < len(headings) else None
        html_content = _extract_between(tag, end_tag, soup)
        clean_soup = BeautifulSoup(html_content, "lxml")
        for t in clean_soup(["script", "style"]):
            t.decompose()
        sections.append(
            {
                "id": section_id,
                "label": label,
                "heading": heading_text,
                "html": str(clean_soup),
                "text_preview": clean_soup.get_text(" ", strip=True)[:500],
            }
        )

    if not sections:
        body = soup.find("body") or soup
        text = body.get_text(" ", strip=True)[:5000] if body else ""
        sections.append(
            {
                "id": "full-document",
                "label": "Full Document",
                "heading": "Full Filing",
                "html": str(body)[:500000] if body else "",
                "text_preview": text[:500],
            }
        )

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
