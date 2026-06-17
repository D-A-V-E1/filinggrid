"""HTTP-level benchmark for compare load endpoints (mirrors frontend)."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import httpx

API = "http://localhost:8000"


def stream_ndjson(path: str, body: dict) -> dict:
    t0 = time.perf_counter()
    marks: dict[str, float] = {}
    with httpx.Client(timeout=120.0) as client:
        with client.stream("POST", f"{API}{path}", json=body, headers={"Accept": "application/x-ndjson"}) as res:
            res.raise_for_status()
            buf = ""
            for chunk in res.iter_bytes():
                buf += chunk.decode()
                while "\n" in buf:
                    line, buf = buf.split("\n", 1)
                    if not line.strip():
                        continue
                    elapsed = (time.perf_counter() - t0) * 1000
                    event = json.loads(line)
                    et = event.get("type")
                    if et == "catalog":
                        marks["catalog_ms"] = elapsed
                    elif et == "column":
                        marks[f"column_{event['column']['ticker']}_ms"] = elapsed
                    elif et == "start":
                        marks["fin_start_ms"] = elapsed
                    elif et == "financial":
                        marks[f"fin_{event['ticker']}_ms"] = elapsed
                        marks[f"fin_{event['ticker']}_fetch_ms"] = event["financials"].get("fetch_ms")
                    elif et == "done":
                        marks["done_ms"] = elapsed
    return marks


def main() -> None:
    tickers = sys.argv[1:] or ["AAPL", "MSFT"]
    print(f"Tickers: {tickers}")
    for label in ("run1", "run2"):
        print(f"\n--- {label} ---")
        parse = stream_ndjson("/parse/stream", {"tickers": tickers, "fiscal_year": None})
        fin = stream_ndjson(
            "/filings/financials/batch",
            {"tickers": tickers, "fiscal_year": None, "headline_only": True},
        )
        print("parse:", {k: f"{v:.0f}ms" for k, v in sorted(parse.items())})
        print("financials:", {k: f"{v:.0f}ms" if isinstance(v, float) else v for k, v in sorted(fin.items())})


if __name__ == "__main__":
    main()
