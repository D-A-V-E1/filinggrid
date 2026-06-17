"""Benchmark cold/warm load paths for parse stream + financials batch."""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from filing_parser import ParseRequest, parse_filings_stream
from sec.xbrl_client import fetch_tickers_financials_stream


async def bench_parse(tickers: list[str], fiscal_year: int | None = None) -> dict:
    req = ParseRequest(tickers=tickers, fiscal_year=fiscal_year)
    t0 = time.perf_counter()
    catalog_ms = None
    column_ms: dict[str, float] = {}
    done_ms = None

    async for line in parse_filings_stream(req):
        elapsed = (time.perf_counter() - t0) * 1000
        event = json.loads(line)
        if event["type"] == "catalog":
            catalog_ms = elapsed
        elif event["type"] == "column":
            col = event["column"]
            column_ms[col["ticker"]] = elapsed
        elif event["type"] == "done":
            done_ms = elapsed

    return {"catalog_ms": catalog_ms, "columns_ms": column_ms, "done_ms": done_ms}


async def bench_financials(tickers: list[str], headline_only: bool = True) -> dict:
    t0 = time.perf_counter()
    start_ms = None
    financial_ms: dict[str, float] = {}
    done_ms = None

    async for line in fetch_tickers_financials_stream(tickers, headline_only=headline_only):
        elapsed = (time.perf_counter() - t0) * 1000
        event = json.loads(line)
        if event["type"] == "start":
            start_ms = elapsed
        elif event["type"] == "financial":
            fin = event["financials"]
            financial_ms[event["ticker"]] = elapsed
            financial_ms[f"{event['ticker']}_fetch_ms"] = fin.get("fetch_ms")
        elif event["type"] == "done":
            done_ms = elapsed

    return {"start_ms": start_ms, "financials_ms": financial_ms, "done_ms": done_ms}


async def run(label: str, tickers: list[str]) -> None:
    print(f"\n=== {label}: {', '.join(tickers)} ===")
    parse_task = asyncio.create_task(bench_parse(tickers))
    fin_headline_task = asyncio.create_task(bench_financials(tickers, headline_only=True))
    parse_res, fin_res = await asyncio.gather(parse_task, fin_headline_task)
    print(f"Parse catalog: {parse_res['catalog_ms']:.0f}ms")
    for t, ms in parse_res["columns_ms"].items():
        print(f"  column {t}: {ms:.0f}ms")
    print(f"Parse done: {parse_res['done_ms']:.0f}ms")
    print(f"Financials start: {fin_res['start_ms']:.0f}ms")
    for k, v in fin_res["financials_ms"].items():
        if not k.endswith("_fetch_ms"):
            backend = fin_res["financials_ms"].get(f"{k}_fetch_ms", "?")
            print(f"  financial {k}: {v:.0f}ms (backend fetch_ms={backend})")
    print(f"Financials done: {fin_res['done_ms']:.0f}ms")


async def main() -> None:
    for tickers in [["AAPL"], ["AAPL", "MSFT"]]:
        await run("COLD (first run)", tickers)
        await run("WARM (second run)", tickers)


if __name__ == "__main__":
    asyncio.run(main())
