"""Smoke-test Pro compare: parse stream + financials batch for multi-ticker layouts."""

from __future__ import annotations

import asyncio
import json
import os
import sys

import httpx

API = os.environ.get("FILINGGRID_API", "http://localhost:8000")
HEADERS_PRO = {"Accept": "application/x-ndjson", "X-Dev-Tier": "professional"}


async def smoke_parse(tickers: list[str], fiscal_year: int) -> tuple[bool, str]:
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            f"{API}/parse/stream",
            json={"tickers": tickers, "fiscal_year": fiscal_year},
            headers=HEADERS_PRO,
        )
        if r.status_code == 402:
            return False, f"parse blocked (402): {r.text[:200]}"
        if r.status_code != 200:
            return False, f"parse HTTP {r.status_code}: {r.text[:200]}"

        columns = 0
        for line in r.text.strip().splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get("type") == "column":
                columns += 1
        if columns != len(tickers):
            return False, f"parse returned {columns}/{len(tickers)} columns"
        return True, f"parse ok ({columns} columns)"


async def smoke_financials(tickers: list[str], fiscal_year: int) -> tuple[bool, str]:
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            f"{API}/filings/financials/batch",
            json={"tickers": tickers, "fiscal_year": fiscal_year, "headline_only": True},
            headers=HEADERS_PRO,
        )
        if r.status_code != 200:
            return False, f"financials HTTP {r.status_code}: {r.text[:200]}"

        loaded: dict[str, int] = {}
        for line in r.text.strip().splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get("type") != "financial":
                continue
            fin = row.get("financials") or {}
            ticker = str(row.get("ticker", "")).upper()
            rows = fin.get("annual_summary") or []
            loaded[ticker] = len(rows)

        missing = [t for t in tickers if t.upper() not in loaded]
        empty = [t for t, n in loaded.items() if n == 0]
        if missing:
            return False, f"financials missing tickers: {missing}"
        if empty:
            return False, f"financials empty annual_summary: {empty}"
        return True, f"financials ok ({len(loaded)} tickers, rows={loaded})"


async def main() -> int:
    cases = [
        (["JPM", "GS"], 2024),
        (["JPM", "GS", "MS"], 2024),
        (["JPM", "GS", "MS", "BRK-B"], 2024),
        (["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA"], 2024),
        (["JPM", "GS", "MS", "BRK-B", "BAC", "WFC", "C", "USB"], 2024),
    ]
    failures = 0
    for tickers, fy in cases:
        label = f"{len(tickers)} tickers ({', '.join(tickers)})"
        fin_ok, fin_msg = await smoke_financials(tickers, fy)
        parse_ok, parse_msg = await smoke_parse(tickers, fy)
        status = "PASS" if fin_ok and parse_ok else "FAIL"
        if not fin_ok or not parse_ok:
            failures += 1
        print(f"[{status}] {label}")
        print(f"       financials: {fin_msg}")
        print(f"       parse:      {parse_msg}")

    if failures:
        print(f"\n{failures} case(s) failed. Ensure API runs with ALLOW_DEV_TIER_TOGGLE=true.")
        return 1
    print("\nAll Pro compare smoke tests passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
