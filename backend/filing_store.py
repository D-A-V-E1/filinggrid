"""Persistent on-disk cache for public SEC filings (HTML + parsed sections)."""

from __future__ import annotations

import gzip
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from config import get_settings

settings = get_settings()
_BACKEND_DIR = Path(__file__).resolve().parent
PARSE_CACHE_VERSION = 9


def _cache_root() -> Path:
    root = Path(settings.filing_cache_dir)
    if not root.is_absolute():
        root = _BACKEND_DIR / root
    root.mkdir(parents=True, exist_ok=True)
    return root


def make_cache_key(ticker: str, fiscal_year: int | None, accession: str = "") -> str:
    return f"{ticker.upper()}:{fiscal_year or 'latest'}:{accession}"


def _safe_name(key: str) -> str:
    return key.replace(":", "_").replace("/", "_")


def load_parsed_filing(cache_key: str) -> dict[str, Any] | None:
    if not settings.filing_cache_enabled:
        return None
    path = _cache_root() / "parsed" / f"{_safe_name(cache_key)}.json.gz"
    if not path.exists():
        return None
    try:
        with gzip.open(path, "rt", encoding="utf-8") as f:
            data = json.load(f)
        if data.get("parse_version") != PARSE_CACHE_VERSION:
            return None
        return data
    except (OSError, json.JSONDecodeError):
        return None


def save_parsed_filing(
    cache_key: str,
    column: dict[str, Any],
    sections: list[dict[str, Any]],
) -> None:
    if not settings.filing_cache_enabled:
        return
    path = _cache_root() / "parsed" / f"{_safe_name(cache_key)}.json.gz"
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "parse_version": PARSE_CACHE_VERSION,
        "column": column,
        "sections": sections,
        "cached_at": datetime.utcnow().isoformat() + "Z",
    }
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)


def load_filing_html(cik: str, accession: str) -> bytes | None:
    if not settings.filing_cache_enabled:
        return None
    path = _cache_root() / "html" / f"{int(cik)}_{accession}.html.gz"
    if not path.exists():
        return None
    try:
        return gzip.decompress(path.read_bytes())
    except OSError:
        return None


def save_filing_html(cik: str, accession: str, html_bytes: bytes) -> None:
    if not settings.filing_cache_enabled:
        return
    path = _cache_root() / "html" / f"{int(cik)}_{accession}.html.gz"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(html_bytes, compresslevel=6))


def load_filing_ixbrl_html(cik: str, accession: str) -> bytes | None:
    if not settings.filing_cache_enabled:
        return None
    path = _cache_root() / "html" / f"{int(cik)}_{accession}_ixbrl.html.gz"
    if not path.exists():
        return None
    try:
        return gzip.decompress(path.read_bytes())
    except OSError:
        return None


def save_filing_ixbrl_html(cik: str, accession: str, html_bytes: bytes) -> None:
    if not settings.filing_cache_enabled:
        return
    path = _cache_root() / "html" / f"{int(cik)}_{accession}_ixbrl.html.gz"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(html_bytes, compresslevel=6))


def load_submissions(cik: str) -> dict[str, Any] | None:
    if not settings.filing_cache_enabled:
        return None
    path = _cache_root() / "submissions" / f"{int(cik)}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def save_submissions(cik: str, data: dict[str, Any]) -> None:
    if not settings.filing_cache_enabled:
        return
    path = _cache_root() / "submissions" / f"{int(cik)}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


def load_company_facts(cik: str) -> dict[str, Any] | None:
    if not settings.filing_cache_enabled:
        return None
    path = _cache_root() / "companyfacts" / f"{int(cik)}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def save_company_facts(cik: str, data: dict[str, Any]) -> None:
    if not settings.filing_cache_enabled:
        return
    path = _cache_root() / "companyfacts" / f"{int(cik)}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


def update_section_html(cache_key: str, section_id: str, html: str) -> None:
    """Merge section HTML into an existing parsed filing cache entry."""
    if not settings.filing_cache_enabled:
        return
    path = _cache_root() / "parsed" / f"{_safe_name(cache_key)}.json.gz"
    if not path.exists():
        return
    try:
        with gzip.open(path, "rt", encoding="utf-8") as f:
            data = json.load(f)
        if data.get("parse_version") != PARSE_CACHE_VERSION:
            return
        for section in data.get("sections", []):
            if section.get("id") == section_id:
                section["html"] = html
                break
        with gzip.open(path, "wt", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except (OSError, json.JSONDecodeError):
        return


def find_cache_key(ticker: str, fiscal_year: int | None) -> str | None:
    """Return the newest disk cache key for a ticker (optional fiscal year filter)."""
    if not settings.filing_cache_enabled:
        return None
    parsed_dir = _cache_root() / "parsed"
    if not parsed_dir.exists():
        return None
    ticker = ticker.upper()
    for path in sorted(parsed_dir.glob("*.json.gz"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            with gzip.open(path, "rt", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("parse_version") != PARSE_CACHE_VERSION:
                continue
            col = data.get("column", {})
            if col.get("ticker", "").upper() != ticker:
                continue
            if fiscal_year is not None and col.get("fiscal_year") != fiscal_year:
                continue
            return col.get("cache_key") or _cache_key_from_path(path)
        except (OSError, json.JSONDecodeError):
            continue
    return None


def _cache_key_from_path(path: Path) -> str:
    name = path.stem.replace(".json", "")
    parts = name.split("_", 2)
    if len(parts) >= 3:
        return f"{parts[0]}:{parts[1]}:{parts[2]}"
    return name


def find_section_html(ticker: str, section_id: str, fiscal_year: int | None) -> str | None:
    if not settings.filing_cache_enabled:
        return None
    parsed_dir = _cache_root() / "parsed"
    if not parsed_dir.exists():
        return None
    ticker = ticker.upper()
    for path in sorted(parsed_dir.glob("*.json.gz"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            with gzip.open(path, "rt", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("parse_version") != PARSE_CACHE_VERSION:
                continue
            col = data.get("column", {})
            if col.get("ticker", "").upper() != ticker:
                continue
            if fiscal_year is not None and col.get("fiscal_year") != fiscal_year:
                continue
            for section in data.get("sections", []):
                if section.get("id") == section_id:
                    html = section.get("html")
                    if html:
                        return html
        except (OSError, json.JSONDecodeError):
            continue
    return None
