"""Pre-warm SEC HTML + parsed section disk cache for popular tickers."""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from filing_parser import ParseRequest, parse_filings
from sec.client import close_http_client

DEFAULT_TICKERS = [
    "AAPL",
    "NVDA",
    "TSM",
    "MSFT",
    "AMD",
    "INTC",
    "JPM",
    "GS",
    # Popular ADRs — large 20-F filings that need warm disk cache on cold API.
    "ASML",
    "SAP",
    "NVO",
]
MAX_CONCURRENT = 3


async def _prewarm_one(ticker: str, sem: asyncio.Semaphore) -> tuple[str, bool, str, float]:
    async with sem:
        t0 = time.perf_counter()
        result = await parse_filings(ParseRequest(tickers=[ticker], fiscal_year=None))
        col = result.columns[0]
        elapsed = time.perf_counter() - t0
        if col.error:
            return ticker, False, col.error, elapsed
        status = "cached" if col.from_cache else "parsed"
        return ticker, True, f"{status}, {len(col.sections)} sections", elapsed


async def prewarm(tickers: list[str]) -> int:
    tickers = [t.upper() for t in tickers]
    t0 = time.perf_counter()
    print(
        f"Pre-warming {len(tickers)} tickers (max {MAX_CONCURRENT} concurrent): {', '.join(tickers)}",
        flush=True,
    )
    sem = asyncio.Semaphore(MAX_CONCURRENT)
    results = await asyncio.gather(*[_prewarm_one(t, sem) for t in tickers])
    ok = 0
    for ticker, success, detail, elapsed in results:
        if success:
            ok += 1
            print(f"  {ticker}: {detail} ({elapsed:.1f}s)", flush=True)
        else:
            print(f"  {ticker}: ERROR — {detail}", flush=True)
    print(f"Done in {time.perf_counter() - t0:.1f}s ({ok}/{len(tickers)} ok)", flush=True)
    await close_http_client()
    return 0 if ok == len(tickers) else 1


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-warm filing disk cache")
    parser.add_argument("--tickers", nargs="+", default=DEFAULT_TICKERS)
    args = parser.parse_args()
    raise SystemExit(asyncio.run(prewarm(args.tickers)))


if __name__ == "__main__":
    main()
