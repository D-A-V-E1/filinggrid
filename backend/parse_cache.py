"""Hot in-memory layer on top of persistent filing_store."""

from __future__ import annotations

from collections import OrderedDict
from threading import Lock, Thread
from typing import Any

from filing_store import find_cache_key as disk_find_cache_key
from filing_store import find_section_html as disk_find_section_html
from filing_store import load_parsed_filing, make_cache_key, save_parsed_filing, update_section_html

_MAX_ENTRIES = 64
_lock = Lock()
_memory: OrderedDict[str, dict[str, Any]] = OrderedDict()
_structure: OrderedDict[str, dict[str, Any]] = OrderedDict()


def _touch(key: str) -> None:
    _memory.move_to_end(key)


def store_parsed_column(key: str, column: dict[str, Any], sections: list[dict[str, Any]]) -> None:
    sections_html = {s["id"]: s.get("html", "") for s in sections if s.get("html")}
    with _lock:
        _memory[key] = {"column_meta": column, "sections_html": sections_html, "sections": sections}
        _touch(key)
        while len(_memory) > _MAX_ENTRIES:
            _memory.popitem(last=False)
    Thread(target=save_parsed_filing, args=(key, column, sections), daemon=True).start()


def store_section_html(cache_key: str, section_id: str, html: str) -> None:
    with _lock:
        entry = _memory.get(cache_key)
        if entry:
            entry["sections_html"][section_id] = html
            for section in entry.get("sections", []):
                if section.get("id") == section_id:
                    section["html"] = html
                    break
            _touch(cache_key)
    Thread(target=update_section_html, args=(cache_key, section_id, html), daemon=True).start()


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
            if html:
                _touch(key)
                return html
    return disk_find_section_html(ticker, section_id, fiscal_year)


def store_filing_structure(cache_key: str, structure: dict[str, Any]) -> None:
    """Keep parsed DOM structure in memory for fast on-demand section extraction."""
    with _lock:
        _structure[cache_key] = structure
        _structure.move_to_end(cache_key)
        while len(_structure) > _MAX_ENTRIES:
            _structure.popitem(last=False)


def get_filing_structure(cache_key: str) -> dict[str, Any] | None:
    with _lock:
        structure = _structure.get(cache_key)
        if structure is not None:
            _structure.move_to_end(cache_key)
        return structure


def clear_filing_structure(cache_key: str) -> None:
    with _lock:
        _structure.pop(cache_key, None)


def evict_parsed_column(cache_key: str) -> None:
    """Drop in-memory parsed column + structure so disk refetch can proceed."""
    with _lock:
        _memory.pop(cache_key, None)
        _structure.pop(cache_key, None)


def find_cache_key(ticker: str, fiscal_year: int | None) -> str | None:
    ticker = ticker.upper()
    with _lock:
        for key, entry in reversed(_memory.items()):
            col = entry["column_meta"]
            if col.get("ticker", "").upper() != ticker:
                continue
            if fiscal_year is not None and col.get("fiscal_year") != fiscal_year:
                continue
            return key
    return disk_find_cache_key(ticker, fiscal_year)


__all__ = [
    "make_cache_key",
    "store_parsed_column",
    "store_section_html",
    "load_parsed_column",
    "find_section_html",
    "find_cache_key",
    "store_filing_structure",
    "get_filing_structure",
    "clear_filing_structure",
    "evict_parsed_column",
]
