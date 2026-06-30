"""API probes for pre-promote checklist (steps 3, 13, 14, 15).

Usage:
  python scripts/pre_promote_api_checks.py --probe counter
  python scripts/pre_promote_api_checks.py --probe interim
  python scripts/pre_promote_api_checks.py --probe cold
  python scripts/pre_promote_api_checks.py --probe As --probe paywall
  python scripts/pre_promote_api_checks.py --probe all
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = os.environ.get(
    "FILINGGRID_API",
    os.environ.get("API_URL", "https://peerdisclosures-api.onrender.com"),
).rstrip("/")
HEADERS_PRO = {
    "Accept": "application/x-ndjson",
    "Content-Type": "application/json",
    "X-Dev-Tier": "professional",
}
HEADERS_FREE = {
    "Accept": "application/x-ndjson",
    "Content-Type": "application/json",
}

THROTTLE = float(os.environ.get("FILINGGRID_THROTTLE_S", "5"))
DEFAULT_TICKERS = ["AAPL", "MSFT", "NVDA"]


def post_ndjson(path: str, body: dict, headers: dict) -> tuple[int, list[dict]]:
    url = f"{API}{path}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=300) as resp:
        lines = [
            json.loads(line)
            for line in resp.read().decode().splitlines()
            if line.strip()
        ]
        return resp.status, lines


def get_json(path: str, headers: dict | None = None) -> tuple[int, dict | str]:
    req = urllib.request.Request(f"{API}{path}", headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw[:300]


def count_columns(lines: list[dict]) -> list[dict]:
    return [row["column"] for row in lines if row.get("type") == "column"]


def probe_counter(tickers: list[str]) -> tuple[str, str]:
    """Step 3: parse proxy — section counts per column should be consistent."""
    try:
        status, lines = post_ndjson(
            "/parse/stream",
            {"tickers": tickers, "period": "interim-2026-Q2"},
            HEADERS_PRO,
        )
    except urllib.error.HTTPError as exc:
        return "FAIL", f"parse HTTP {exc.code}: {exc.read()[:200]!r}"
    except Exception as exc:
        return "FAIL", str(exc)

    cols = count_columns(lines)
    if status != 200 or len(cols) != len(tickers):
        return "FAIL", f"status={status} columns={len(cols)}/{len(tickers)}"

    per_col = []
    for col in cols:
        secs = [s.get("id") for s in (col.get("sections") or []) if s.get("id")]
        per_col.append(
            {
                "ticker": col.get("ticker"),
                "sections": len(secs),
                "error": col.get("error"),
            }
        )
    errors = [c for c in per_col if c.get("error")]
    if errors:
        return "FAIL", json.dumps({"per_column": per_col})
    counts = [c["sections"] for c in per_col]
    spread = max(counts) - min(counts) if counts else 0
    detail = json.dumps({"per_column": per_col, "section_spread": spread})
    if spread > 3:
        return "WARN", f"section count spread {spread} — verify delta counters in browser; {detail}"
    print(detail)
    return "PASS", f"3-col interim parse OK; sections {counts}"


def probe_interim_annual(tickers: list[str]) -> tuple[str, str]:
    """Step 13: both periods should return full column set."""
    try:
        _, interim_lines = post_ndjson(
            "/parse/stream",
            {"tickers": tickers, "period": "interim-2026-Q2"},
            HEADERS_PRO,
        )
        time.sleep(THROTTLE)
        _, annual_lines = post_ndjson(
            "/parse/stream",
            {"tickers": tickers, "fiscal_year": 2025},
            HEADERS_PRO,
        )
    except urllib.error.HTTPError as exc:
        return "FAIL", f"parse HTTP {exc.code}: {exc.read()[:200]!r}"
    except Exception as exc:
        return "FAIL", str(exc)

    interim_cols = count_columns(interim_lines)
    annual_cols = count_columns(annual_lines)
    interim_union = {
        sid
        for col in interim_cols
        for sec in col.get("sections") or []
        if (sid := sec.get("id"))
    }
    annual_union = {
        sid
        for col in annual_cols
        for sec in col.get("sections") or []
        if (sid := sec.get("id"))
    }
    detail = {
        "interim": {"columns": len(interim_cols), "sections_union": len(interim_union)},
        "annual_fy2025": {"columns": len(annual_cols), "sections_union": len(annual_union)},
    }
    print(json.dumps(detail))
    if len(interim_cols) != len(tickers) or len(annual_cols) != len(tickers):
        return "FAIL", json.dumps(detail)
    return "PASS", json.dumps(detail)


def probe_cold_start() -> tuple[str, str]:
    """Step 14: health latency + warm parse timing."""
    t0 = time.perf_counter()
    try:
        health_code, body = get_json("/health")
    except Exception as exc:
        return "FAIL", str(exc)
    health_ms = round((time.perf_counter() - t0) * 1000)

    time.sleep(THROTTLE)
    t1 = time.perf_counter()
    try:
        parse_status, lines = post_ndjson(
            "/parse/stream",
            {"tickers": DEFAULT_TICKERS, "period": "interim-2026-Q2"},
            HEADERS_PRO,
        )
    except urllib.error.HTTPError as exc:
        return "FAIL", f"parse HTTP {exc.code}"
    except Exception as exc:
        return "FAIL", str(exc)
    parse_ms = round((time.perf_counter() - t1) * 1000)
    cols = count_columns(lines)

    detail = {
        "health_code": health_code,
        "health_ms": health_ms,
        "parse_status": parse_status,
        "parse_ms": parse_ms,
        "columns": len(cols),
    }
    print(json.dumps(detail))
    if health_code != 200 or parse_status != 200 or len(cols) != 3:
        return "FAIL", json.dumps(detail)
    if parse_ms > 120_000:
        return "WARN", f"parse slow ({parse_ms}ms); {json.dumps(detail)}"
    return "PASS", json.dumps(detail)


def probe_paywall() -> tuple[str, str]:
    """Step 15: 4-ticker column_limit + optional historical gate."""
    results: dict[str, dict] = {}
    try:
        post_ndjson(
            "/parse/stream",
            {"tickers": ["AAPL", "MSFT", "NVDA", "GOOGL"]},
            HEADERS_FREE,
        )
        results["four_ticker"] = {"status": 200, "detail": "unexpected 200 — paywall missing?"}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()[:200]
        results["four_ticker"] = {"status": exc.code, "detail": body}
    except Exception as exc:
        return "FAIL", str(exc)

    time.sleep(THROTTLE)
    code, body = get_json("/filings/AAPL/financials?fiscal_year=2020", HEADERS_FREE)
    results["historical_fy2020"] = {"status": code, "detail": str(body)[:200]}

    print(json.dumps(results))
    four = results["four_ticker"]["status"]
    if four != 402:
        return "FAIL", f"expected 402 on 4-ticker free parse, got {four}"
    return "PASS", json.dumps(results)


PROBES = {
    "counter": lambda _: probe_counter(DEFAULT_TICKERS),
    "interim": lambda _: probe_interim_annual(DEFAULT_TICKERS),
    "cold": lambda _: probe_cold_start(),
    "paywall": lambda _: probe_paywall(),
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Pre-promote API probes")
    parser.add_argument(
        "--probe",
        choices=[*PROBES.keys(), "all"],
        default="all",
        help="Which probe to run",
    )
    args = parser.parse_args()

    print(f"API={API} probe={args.probe}")
    probes = list(PROBES.keys()) if args.probe == "all" else [args.probe]
    worst = 0
    for name in probes:
        print(f"\n=== {name} ===")
        status, detail = PROBES[name](None)
        print(f"{name}: {status} {detail}")
        if status == "FAIL":
            worst = 1
    return worst


if __name__ == "__main__":
    raise SystemExit(main())
