"""Pre-warm SEC HTML + parsed section disk cache for high-traffic tickers."""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from filing_parser import ParseRequest, parse_filings
from sec.client import close_http_client

# Curated ~36 tickers: popular compare presets, large 20-F ADRs, semicap equipment.
# Override via CLI: python scripts/prewarm_cache.py --tickers AAPL MSFT
PREWARM_TICKERS = [
    # Popular comps — mega-cap tech (featured)
    "AAPL",
    "MSFT",
    "NVDA",
    "GOOGL",
    "META",
    # Popular comps — semiconductors
    "AMD",
    "INTC",
    # Popular comps — semicap equipment (large 20-F + domestic 10-K mix)
    "ASML",
    "AMAT",
    "LRCX",
    # Popular comps — money-center banks
    "JPM",
    "GS",
    "MS",
    "BAC",
    # Popular comps — payments
    "V",
    "MA",
    "AXP",
    # Popular comps — healthcare / pharma leaders
    "UNH",
    "ELV",
    "JNJ",
    "LLY",
    # Popular comps — energy majors
    "XOM",
    "CVX",
    # Popular comps — consumer / ecommerce
    "TSLA",
    "AMZN",
    # Popular comps — aerospace & defense
    "BA",
    "LMT",
    "RTX",
    # Foreign filers — large 20-F / ADR (slow HTML parse on cold cache)
    "TSM",
    "SAP",
    "NVO",
    "SONY",
    "TM",
    "BABA",
    "VALE",
    "RIO",
    # Smoke uncommon — EU ADR + domestic mix (adr-eu-us-mix)
    "ORCL",
]

MAX_CONCURRENT = int(os.environ.get("PREWARM_MAX_CONCURRENT", "2"))
THROTTLE_S = float(os.environ.get("PREWARM_THROTTLE_S", "5.0"))
DEFAULT_FISCAL_YEARS: list[int | None] = [None]  # latest filing; pass --fiscal-year 2025 to pin


async def _prewarm_one(
    ticker: str,
    fiscal_year: int | None,
    sem: asyncio.Semaphore,
) -> tuple[str, int | None, bool, str, float]:
    async with sem:
        t0 = time.perf_counter()
        result = await parse_filings(
            ParseRequest(tickers=[ticker], fiscal_year=fiscal_year)
        )
        col = result.columns[0]
        elapsed = time.perf_counter() - t0
        fy_label = fiscal_year if fiscal_year is not None else "latest"
        if col.error:
            return ticker, fiscal_year, False, col.error, elapsed
        status = "cached" if col.from_cache else "parsed"
        detail = f"FY{fy_label}, {status}, {len(col.sections)} sections"
        await asyncio.sleep(THROTTLE_S)
        return ticker, fiscal_year, True, detail, elapsed


async def prewarm(
    tickers: list[str],
    fiscal_years: list[int | None],
    *,
    dry_run: bool = False,
) -> int:
    tickers = list(dict.fromkeys(t.upper() for t in tickers))
    jobs = [(t, fy) for t in tickers for fy in fiscal_years]
    fy_note = ", ".join("latest" if fy is None else str(fy) for fy in fiscal_years)
    print(
        f"Pre-warming {len(jobs)} jobs ({len(tickers)} tickers × {len(fiscal_years)} period(s): {fy_note})",
        flush=True,
    )
    print(
        f"  max {MAX_CONCURRENT} concurrent, {THROTTLE_S:.0f}s throttle after each job",
        flush=True,
    )
    if dry_run:
        for ticker, fy in jobs:
            fy_label = "latest" if fy is None else f"FY{fy}"
            print(f"  [dry-run] {ticker} ({fy_label})", flush=True)
        return 0

    t0 = time.perf_counter()
    sem = asyncio.Semaphore(MAX_CONCURRENT)
    tasks = [_prewarm_one(t, fy, sem) for t, fy in jobs]
    results = await asyncio.gather(*tasks)
    ok = 0
    for ticker, fy, success, detail, elapsed in results:
        fy_label = "latest" if fy is None else f"FY{fy}"
        tag = f"{ticker}/{fy_label}"
        if success:
            ok += 1
            print(f"  {tag}: {detail} ({elapsed:.1f}s)", flush=True)
        else:
            print(f"  {tag}: ERROR — {detail}", flush=True)
    print(f"Done in {time.perf_counter() - t0:.1f}s ({ok}/{len(jobs)} ok)", flush=True)
    await close_http_client()
    return 0 if ok == len(jobs) else 1


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-warm filing disk cache")
    parser.add_argument(
        "--tickers",
        nargs="+",
        default=PREWARM_TICKERS,
        help="Tickers to warm (default: curated PREWARM_TICKERS list)",
    )
    parser.add_argument(
        "--fiscal-year",
        type=int,
        nargs="*",
        default=None,
        metavar="YEAR",
        help="Fiscal year(s) to warm per ticker (default: latest only). "
        "Example: --fiscal-year 2025 for pinned FY2025.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned jobs without calling SEC/parser",
    )
    args = parser.parse_args()
    fiscal_years: list[int | None] = (
        DEFAULT_FISCAL_YEARS if args.fiscal_year is None else list(args.fiscal_year)
    )
    raise SystemExit(asyncio.run(prewarm(args.tickers, fiscal_years, dry_run=args.dry_run)))


if __name__ == "__main__":
    main()
