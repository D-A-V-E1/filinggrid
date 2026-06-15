"""Quick structure-cache timing: 2nd extract_section_html should reuse DOM."""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from filing_store import find_cache_key, load_filing_html
from parse_cache import get_filing_structure, store_filing_structure
from sec.section_extractor import _prepare_filing_structure, extract_section_html


def main() -> None:
    ticker = sys.argv[1] if len(sys.argv) > 1 else "AAPL"
    section_id = sys.argv[2] if len(sys.argv) > 2 else "md-a"

    cache_key = find_cache_key(ticker, None)
    if not cache_key:
        print(f"No cached filing for {ticker}; run /parse first.")
        sys.exit(1)

    parts = cache_key.split(":", 2)
    cik = None
    accession = parts[2] if len(parts) >= 3 else ""
    from parse_cache import load_parsed_column

    col_meta, _ = load_parsed_column(cache_key) or ({}, [])
    cik = col_meta.get("cik", "")
    if not cik or not accession:
        print(f"Bad cache key: {cache_key}")
        sys.exit(1)

    html_bytes = load_filing_html(cik, accession)
    if not html_bytes:
        print("HTML not on disk")
        sys.exit(1)

    t0 = time.perf_counter()
    structure = _prepare_filing_structure(html_bytes)
    cold_ms = round((time.perf_counter() - t0) * 1000, 1)
    store_filing_structure(cache_key, structure)

    t1 = time.perf_counter()
    html1 = extract_section_html(html_bytes, section_id, structure)
    extract1_ms = round((time.perf_counter() - t1) * 1000, 1)

    warm = get_filing_structure(cache_key)
    t2 = time.perf_counter()
    html2 = extract_section_html(html_bytes, section_id, warm)
    extract2_ms = round((time.perf_counter() - t2) * 1000, 1)

    print(f"prepare_structure: {cold_ms}ms")
    print(f"extract (cached structure): {extract1_ms}ms, len={len(html1 or '')}")
    print(f"extract (warm LRU): {extract2_ms}ms, len={len(html2 or '')}")


if __name__ == "__main__":
    main()
