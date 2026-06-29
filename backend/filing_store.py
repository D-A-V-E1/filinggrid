"""Persistent on-disk cache for public SEC filings (HTML + parsed sections)."""



from __future__ import annotations



import gzip
import json
import zlib

from datetime import datetime

from pathlib import Path

from typing import Any



from config import get_settings



settings = get_settings()

_BACKEND_DIR = Path(__file__).resolve().parent

PARSE_CACHE_VERSION = 10



_GZIP_READ_ERRORS = (OSError, EOFError, zlib.error)





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





def _discard_corrupt_cache_file(path: Path) -> None:

    try:

        path.unlink(missing_ok=True)

    except OSError:

        pass





def is_gzip_corruption_error(exc: BaseException) -> bool:

    if isinstance(exc, EOFError):

        return True

    msg = str(exc)

    if "Compressed file ended before the end-of-stream" in msg:

        return True

    if isinstance(exc, (OSError, zlib.error)):

        return "invalid gzip" in msg.lower() or "incorrect header check" in msg.lower()

    return False





def invalidate_filing_html_caches(cik: str, accession: str) -> None:

    """Drop all gzipped HTML variants for one filing (primary, ixbrl, report)."""

    root = _cache_root() / "html"

    cik_int = int(cik)

    for suffix in ("", "_ixbrl", "_report"):

        _discard_corrupt_cache_file(root / f"{cik_int}_{accession}{suffix}.html.gz")





def invalidate_parsed_filing(cache_key: str) -> None:

    path = _cache_root() / "parsed" / f"{_safe_name(cache_key)}.json.gz"

    _discard_corrupt_cache_file(path)





def _read_gzip_bytes(path: Path) -> bytes | None:

    if not path.exists():

        return None

    try:

        return gzip.decompress(path.read_bytes())

    except _GZIP_READ_ERRORS:

        _discard_corrupt_cache_file(path)

        return None





def _read_gzip_json(path: Path) -> dict[str, Any] | None:

    if not path.exists():

        return None

    try:

        with gzip.open(path, "rt", encoding="utf-8") as f:

            return json.load(f)

    except (*_GZIP_READ_ERRORS, json.JSONDecodeError):

        _discard_corrupt_cache_file(path)

        return None





def _atomic_write_bytes(path: Path, data: bytes) -> None:

    path.parent.mkdir(parents=True, exist_ok=True)

    tmp = path.with_suffix(path.suffix + ".tmp")

    try:

        tmp.write_bytes(data)

        tmp.replace(path)

    except OSError:

        tmp.unlink(missing_ok=True)

        raise





def _atomic_write_gzip_json(path: Path, payload: dict[str, Any]) -> None:

    path.parent.mkdir(parents=True, exist_ok=True)

    tmp = path.with_suffix(path.suffix + ".tmp")

    try:

        with gzip.open(tmp, "wt", encoding="utf-8") as f:

            json.dump(payload, f, ensure_ascii=False)

        tmp.replace(path)

    except OSError:

        tmp.unlink(missing_ok=True)

        raise





def load_parsed_filing(cache_key: str) -> dict[str, Any] | None:

    if not settings.filing_cache_enabled:

        return None

    path = _cache_root() / "parsed" / f"{_safe_name(cache_key)}.json.gz"

    data = _read_gzip_json(path)

    if not data:

        return None

    if data.get("parse_version") != PARSE_CACHE_VERSION:

        return None

    return data





def save_parsed_filing(

    cache_key: str,

    column: dict[str, Any],

    sections: list[dict[str, Any]],

) -> None:

    if not settings.filing_cache_enabled:

        return

    path = _cache_root() / "parsed" / f"{_safe_name(cache_key)}.json.gz"

    payload = {

        "parse_version": PARSE_CACHE_VERSION,

        "column": column,

        "sections": sections,

        "cached_at": datetime.utcnow().isoformat() + "Z",

    }

    _atomic_write_gzip_json(path, payload)





def load_filing_html(cik: str, accession: str) -> bytes | None:

    if not settings.filing_cache_enabled:

        return None

    path = _cache_root() / "html" / f"{int(cik)}_{accession}.html.gz"

    return _read_gzip_bytes(path)





def save_filing_html(cik: str, accession: str, html_bytes: bytes) -> None:

    if not settings.filing_cache_enabled:

        return

    path = _cache_root() / "html" / f"{int(cik)}_{accession}.html.gz"

    _atomic_write_bytes(path, gzip.compress(html_bytes, compresslevel=6))





def load_filing_ixbrl_html(cik: str, accession: str) -> bytes | None:

    if not settings.filing_cache_enabled:

        return None

    path = _cache_root() / "html" / f"{int(cik)}_{accession}_ixbrl.html.gz"

    return _read_gzip_bytes(path)





def save_filing_ixbrl_html(cik: str, accession: str, html_bytes: bytes) -> None:

    if not settings.filing_cache_enabled:

        return

    path = _cache_root() / "html" / f"{int(cik)}_{accession}_ixbrl.html.gz"

    _atomic_write_bytes(path, gzip.compress(html_bytes, compresslevel=6))





def load_filing_report_html(cik: str, accession: str) -> bytes | None:

    """6-K consolidated report exhibit HTML used for section indexing."""

    if not settings.filing_cache_enabled:

        return None

    path = _cache_root() / "html" / f"{int(cik)}_{accession}_report.html.gz"

    return _read_gzip_bytes(path)





def save_filing_report_html(cik: str, accession: str, html_bytes: bytes) -> None:

    if not settings.filing_cache_enabled:

        return

    path = _cache_root() / "html" / f"{int(cik)}_{accession}_report.html.gz"

    _atomic_write_bytes(path, gzip.compress(html_bytes, compresslevel=6))





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

    data = _read_gzip_json(path)

    if not data or data.get("parse_version") != PARSE_CACHE_VERSION:

        return

    for section in data.get("sections", []):

        if section.get("id") == section_id:

            section["html"] = html

            break

    _atomic_write_gzip_json(path, data)





def _iter_parsed_cache_entries() -> list[tuple[Path, dict[str, Any]]]:

    parsed_dir = _cache_root() / "parsed"

    if not parsed_dir.exists():

        return []

    entries: list[tuple[Path, dict[str, Any]]] = []

    for path in sorted(parsed_dir.glob("*.json.gz"), key=lambda p: p.stat().st_mtime, reverse=True):

        data = _read_gzip_json(path)

        if not data or data.get("parse_version") != PARSE_CACHE_VERSION:

            continue

        entries.append((path, data))

    return entries





def find_cache_key(ticker: str, fiscal_year: int | None) -> str | None:

    """Return the newest disk cache key for a ticker (optional fiscal year filter)."""

    if not settings.filing_cache_enabled:

        return None

    ticker = ticker.upper()

    for path, data in _iter_parsed_cache_entries():

        col = data.get("column", {})

        if col.get("ticker", "").upper() != ticker:

            continue

        if fiscal_year is not None and col.get("fiscal_year") != fiscal_year:

            continue

        return col.get("cache_key") or _cache_key_from_path(path)

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

    ticker = ticker.upper()

    for _path, data in _iter_parsed_cache_entries():

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

    return None

