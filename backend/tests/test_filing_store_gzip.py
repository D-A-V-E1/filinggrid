"""Corrupt/truncated gzip cache entries must be treated as cache misses."""

from __future__ import annotations

import gzip
from pathlib import Path

import pytest

import filing_store
from filing_store import (
    invalidate_filing_html_caches,
    invalidate_parsed_filing,
    is_gzip_corruption_error,
    load_filing_html,
    load_parsed_filing,
    make_cache_key,
    save_filing_html,
    save_parsed_filing,
)


@pytest.fixture(autouse=True)
def _enable_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(filing_store.settings, "filing_cache_enabled", True)
    monkeypatch.setattr(filing_store.settings, "filing_cache_dir", str(tmp_path))


def test_truncated_html_gzip_is_discarded_and_treated_as_miss():
    path = filing_store._cache_root() / "html" / "2488_000000248812345678.html.gz"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x1f\x8b\x08")

    assert load_filing_html("2488", "000000248812345678") is None
    assert not path.exists()


def test_truncated_parsed_json_gzip_is_discarded_and_treated_as_miss():
    cache_key = make_cache_key("AMD", 2025, "000000000123456789")
    path = filing_store._cache_root() / "parsed" / f"{cache_key.replace(':', '_')}.json.gz"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x1f\x8b\x08")

    assert load_parsed_filing(cache_key) is None
    assert not path.exists()


def test_valid_html_roundtrip_survives_atomic_write():
    html = b"<html><body>AMD 10-K</body></html>"
    save_filing_html("2488", "000000248812345678", html)
    loaded = load_filing_html("2488", "000000248812345678")
    assert loaded == html


def test_valid_parsed_roundtrip_survives_atomic_write():
    cache_key = make_cache_key("AMD", 2025, "000000000123456789")
    column = {"ticker": "AMD", "fiscal_year": 2025, "cache_key": cache_key}
    sections = [{"id": "business", "label": "Business", "text_preview": "We design chips."}]
    save_parsed_filing(cache_key, column, sections)
    loaded = load_parsed_filing(cache_key)
    assert loaded is not None
    assert loaded["column"]["ticker"] == "AMD"
    assert loaded["sections"][0]["id"] == "business"


def test_is_gzip_corruption_error_matches_eof_message():
    exc = EOFError("Compressed file ended before the end-of-stream marker was reached.")
    assert is_gzip_corruption_error(exc)


def test_invalidate_filing_html_caches_removes_all_variants():
    html = b"<html><body>AMD 10-K</body></html>"
    save_filing_html("2488", "000000248812345678", html)
    root = filing_store._cache_root() / "html"
    (root / "2488_000000248812345678_ixbrl.html.gz").write_bytes(b"\x1f\x8b\x08")
    (root / "2488_000000248812345678_report.html.gz").write_bytes(b"\x1f\x8b\x08")

    invalidate_filing_html_caches("2488", "000000248812345678")

    assert load_filing_html("2488", "000000248812345678") is None
    assert not (root / "2488_000000248812345678_ixbrl.html.gz").exists()
    assert not (root / "2488_000000248812345678_report.html.gz").exists()


def test_invalidate_parsed_filing_removes_disk_entry():
    cache_key = make_cache_key("AMD", 2025, "000000000123456789")
    column = {"ticker": "AMD", "fiscal_year": 2025, "cache_key": cache_key}
    sections = [{"id": "business", "label": "Business", "text_preview": "We design chips."}]
    save_parsed_filing(cache_key, column, sections)
    assert load_parsed_filing(cache_key) is not None

    invalidate_parsed_filing(cache_key)

    assert load_parsed_filing(cache_key) is None
