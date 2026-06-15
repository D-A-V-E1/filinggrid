"""Hot in-memory layer on top of persistent filing_store."""

from __future__ import annotations

from collections import OrderedDict
from threading import Lock
from typing import Any

from filing_store import find_section_html as disk_find_section_html
from filing_store import load_parsed_filing, make_cache_key, save_parsed_filing

_MAX_ENTRIES = 64
_lock = Lock()
_memory: OrderedDict[str, dict[str, Any]] = OrderedDict()


def _touch(key: str) -> None:
    _memory.move_to_end(key)


def store_parsed_column(key: str, column: dict[str, Any], sections_with_html: list[dict[str, Any]]) -> None:
    sections_html = {s["id"]: s.get("html", "") for s in sections_with_html}
    with _lock:
        _memory[key] = {"column_meta": column, "sections_html": sections_html, "sections": sections_with_html}
        _touch(key)
        while len(_memory) > _MAX_ENTRIES:
            _memory.popitem(last=False)
    save_parsed_filing(key, column, sections_with_html)


def load_parsed_column(cache_key: str) -> tuple[dict[str, Any], list[dict[str, Any]]] | None:
    with _lock:
        mem = _memory.get(cache_key)
        if mem:
            _touch(cache_key)
            return mem["column_meta"], mem.get("sections") or _sections_from_html_map(mem)

    disk = load_parsed_filing(cache_key)
    if not disk:
        return None

    column = disk["column"]
    sections = disk["sections"]
    with _lock:
        _memory[cache_key] = {
            "column_meta": column,
            "sections_html": {s["id"]: s.get("html", "") for s in sections},
            "sections": sections,
        }
        _touch(cache_key)
        while len(_memory) > _MAX_ENTRIES:
            _memory.popitem(last=False)
    return column, sections


def _sections_from_html_map(mem: dict[str, Any]) -> list[dict[str, Any]]:
    col = mem["column_meta"]
    return [
        {"id": sid, "label": sid, "heading": "", "html": html, "text_preview": ""}
        for sid, html in mem.get("sections_html", {}).items()
    ]


def find_section_html(ticker: str, section_id: str, fiscal_year: int | None) -> str | None:
    ticker = ticker.upper()
    with _lock:
        for key, entry in reversed(_memory.items()):
            col = entry["column_meta"]
            if col.get("ticker", "").upper() != ticker:
                continue
            if fiscal_year is not None and col.get("fiscal_year") != fiscal_year:
                continue
            html = entry["sections_html"].get(section_id)
            if html is not None:
                _touch(key)
                return html
    return disk_find_section_html(ticker, section_id, fiscal_year)


__all__ = ["make_cache_key", "store_parsed_column", "load_parsed_column", "find_section_html"]
