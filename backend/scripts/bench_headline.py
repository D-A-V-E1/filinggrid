import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sec.xbrl_client import fetch_ticker_financials


async def main() -> None:
    for ho in (True, False):
        t0 = time.perf_counter()
        r = await fetch_ticker_financials("AAPL", headline_only=ho)
        wall = (time.perf_counter() - t0) * 1000
        notes = len(r.get("notes_xbrl") or {})
        print(
            f"headline_only={ho}: wall={wall:.0f}ms backend={r.get('fetch_ms')}ms notes={notes}"
        )


if __name__ == "__main__":
    asyncio.run(main())
