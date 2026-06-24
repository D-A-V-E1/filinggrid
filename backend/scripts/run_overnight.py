"""
Unattended overnight runner: pre-warm cache, benchmark, write timestamped report.

Usage (repo root, API must be running on port 8000):
  backend\\.venv\\Scripts\\python.exe backend\\scripts\\run_overnight.py

Options:
  --no-prewarm     Skip pre-warm (only benchmark current cache state)
  --cold           Include cold-cache parse timings
  --tickers AAPL   Override default ticker list
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
_BACKEND = _SCRIPTS.parent
_REPO = _BACKEND.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from benchmark_parse import DEFAULT_API, DEFAULT_TICKERS, format_text_report, run_benchmark
from prewarm_cache import prewarm
from sec.client import close_http_client

BENCH_DIR = _BACKEND / ".cache" / "benchmarks"


async def overnight(
    *,
    api: str,
    tickers: list[str],
    prewarm_first: bool,
    cold: bool,
) -> int:
    BENCH_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    json_path = BENCH_DIR / f"overnight-{stamp}.json"
    log_path = BENCH_DIR / f"overnight-{stamp}.log"

    lines: list[str] = []
    t0 = time.perf_counter()

    def log(msg: str) -> None:
        print(msg)
        lines.append(msg)

    log(f"=== PeerDisclosures overnight run {stamp} ===")
    log(f"API={api} tickers={tickers} prewarm={prewarm_first} cold={cold}")

    if prewarm_first:
        log("\n--- Pre-warm ---")
        rc = await prewarm(tickers)
        if rc != 0:
            log("WARN: pre-warm had errors (continuing to benchmark)")

    log("\n--- Benchmark ---")
    report = await run_benchmark(api_base=api, tickers=tickers, cold=cold, extract_only=False, skip_http=False)
    text = format_text_report(report)
    log(text)

    payload = report.to_dict()
    payload["overnight_elapsed_s"] = round(time.perf_counter() - t0, 1)
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    txt_path = json_path.with_suffix(".txt")
    txt_path.write_text(text, encoding="utf-8")
    log_path.write_text("\n".join(lines) + f"\n\nElapsed: {payload['overnight_elapsed_s']}s\n", encoding="utf-8")

    log(f"\nReports: {json_path}")
    log(f"         {txt_path}")
    log(f"         {log_path}")

    await close_http_client()
    return 0 if report.passed else 1


def main() -> None:
    parser = argparse.ArgumentParser(description="Overnight pre-warm + benchmark")
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--tickers", nargs="+", default=DEFAULT_TICKERS)
    parser.add_argument("--no-prewarm", action="store_true")
    parser.add_argument("--cold", action="store_true", help="Also benchmark after clearing parsed cache")
    args = parser.parse_args()
    raise SystemExit(
        asyncio.run(
            overnight(
                api=args.api,
                tickers=[t.upper() for t in args.tickers],
                prewarm_first=not args.no_prewarm,
                cold=args.cold,
            )
        )
    )


if __name__ == "__main__":
    main()
