"""Section excerpt spot-check for overnight smoke (prod API)."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = os.environ.get("FILINGGRID_API", "https://peerdisclosures-api.onrender.com").rstrip("/")
HEADERS = {"Accept": "application/json", "X-Dev-Tier": "professional"}
THROTTLE_S = float(os.environ.get("FILINGGRID_THROTTLE_S", "5"))

TICKERS = ["AAPL", "MSFT", "NVDA", "JPM", "XOM"]
SECTIONS = ["risk-factors", "mda"]


def get_section(ticker: str, section_id: str, retry_502: bool = True) -> tuple[str, str]:
    params = {
        "ticker": ticker,
        "section_id": section_id,
        "format": "html",
    }
    url = f"{API}/parse/section?{urllib.parse.urlencode(params)}"
    for attempt in range(2 if retry_502 else 1):
        req = urllib.request.Request(url, headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                body = resp.read().decode()
                if resp.status != 200:
                    return "FAIL", f"HTTP {resp.status}"
                data = json.loads(body)
                html = (data.get("html") or data.get("content") or "") if isinstance(data, dict) else ""
                if not html or len(html) < 50:
                    return "WARN", f"short/empty html len={len(html)}"
                return "PASS", f"html len={len(html)}"
        except urllib.error.HTTPError as exc:
            if exc.code == 402:
                return "WARN", "402 paywall (expected on some FY)"
            if exc.code in (502, 503, 504) and attempt == 0 and retry_502:
                time.sleep(8)
                continue
            return "FAIL", f"HTTP {exc.code}: {exc.read()[:120]!r}"
        except Exception as exc:
            return "FAIL", str(exc)
    return "FAIL", "exhausted retries"


def main() -> int:
    print(f"API={API} tickers={len(TICKERS)} sections={len(SECTIONS)}")
    fails = 0
    warns = 0
    for ticker in TICKERS:
        for section_id in SECTIONS:
            time.sleep(THROTTLE_S)
            status, detail = get_section(ticker, section_id)
            print(f"  {ticker}/{section_id}: {status} {detail}")
            if status == "FAIL":
                fails += 1
            elif status == "WARN":
                warns += 1
    print(f"section spot-check: fails={fails} warns={warns}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
