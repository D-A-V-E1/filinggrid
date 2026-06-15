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

DEFAULT_TICKERS = ["AAPL", "MSFT", "NVDA", "AMD", "INTC", "JPM", "GS", "MS"]


async def prewarm(tickers: list[str]) -> int:
    tickers = [t.upper() for t in tickers]
    t0 = time.perf_counter()
    print(f"Pre-warming {len(tickers)} tickers (sequential): {', '.join(tickers)}", flush=True)
    ok = 0
    for ticker in tickers:
        t1 = time.perf_counter()
        result = await parse_filings(ParseRequest(tickers=[ticker], fiscal_year=None))
        col = result.columns[0]
        status = "cached" if col.from_cache else "parsed"
        if col.error:
            print(f"  {col.ticker}: ERROR — {col.error}", flush=True)
        else:
            ok += 1
            print(
                f"  {col.ticker}: {status}, {len(col.sections)} sections ({time.perf_counter() - t1:.1f}s)",
                flush=True,
            )
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
