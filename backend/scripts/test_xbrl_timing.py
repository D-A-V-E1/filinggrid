"""Quick XBRL companyfacts timing check (no HTML parse)."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sec.client import close_http_client
from sec.xbrl_client import fetch_ticker_financials


async def main() -> None:
    ticker = sys.argv[1] if len(sys.argv) > 1 else "AAPL"
    # Cold fetch
    result = await fetch_ticker_financials(ticker)
    print(f"Cold: {result['fetch_ms']}ms from_cache={result['from_cache']}")
    print(f"Annual rows: {len(result.get('annual_summary', []))}")
    if result.get("annual_summary"):
        print("Latest FY:", json.dumps(result["annual_summary"][0], indent=2))
    # Warm fetch
    warm = await fetch_ticker_financials(ticker)
    print(f"Warm: {warm['fetch_ms']}ms from_cache={warm['from_cache']}")
    await close_http_client()


if __name__ == "__main__":
    asyncio.run(main())
