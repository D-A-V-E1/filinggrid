"""
FilingGrid parse performance benchmark suite.

OVERNIGHT PROCESS (Windows)
---------------------------
1. Start the API once (from repo root):
     backend\\.venv\\Scripts\\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
   Or use start.bat if you normally run the full stack.

2. Run unattended overnight (pre-warm disk cache, then benchmark warm + optional cold):
     backend\\.venv\\Scripts\\python.exe backend\\scripts\\run_overnight.py
   Or double-click: backend\\scripts\\run_overnight.bat

3. Morning: open the newest report under backend\\.cache\\benchmarks\\
   - overnight-*.txt  — human summary + pass/fail
   - overnight-*.json — machine-readable timings for diffing across nights

PASS THRESHOLDS (defaults, override with env FG_BENCH_WARM_P95 / FG_BENCH_COLD_P95)
  - Warm p95 (disk cache hit):  < 3s per ticker POST /parse
  - Cold p95 (parsed cache cleared, HTML retained): < 15s per ticker
  - Extract-only p95 (BeautifulSoup, cached HTML): < 8s — flags section_extractor regressions

BOTTLENECK INTERPRETATION
  - extract_only slow, HTTP warm fast  → network/cache OK; optimize section_extractor
  - HTTP warm slow, extract_only fast  → response serialization or multi-ticker gather
  - cold SEC fetch slow                → EDGAR rate limit / missing HTML disk cache
  - stream first-column slow           → UI should use /parse/stream (CompareGrid does)

Examples:
  python backend/scripts/benchmark_parse.py --api http://127.0.0.1:8000
  python backend/scripts/benchmark_parse.py --cold --tickers AAPL MSFT
  python backend/scripts/benchmark_parse.py --extract-only
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from config import get_settings
from filing_store import PARSE_CACHE_VERSION, _cache_root, load_filing_html, load_submissions
from sec.client import close_http_client, fetch_filing_html, fetch_submissions, fetch_ticker_map, find_filing, resolve_ticker
from sec.section_extractor import parse_filing_sections

DEFAULT_TICKERS = ["AAPL", "MSFT", "NVDA", "AMD", "INTC", "JPM", "GS", "MS"]
DEFAULT_API = os.environ.get("FG_BENCH_API", "http://127.0.0.1:8000")
WARM_P95_LIMIT_S = float(os.environ.get("FG_BENCH_WARM_P95", "3"))
COLD_P95_LIMIT_S = float(os.environ.get("FG_BENCH_COLD_P95", "15"))
EXTRACT_P95_LIMIT_S = float(os.environ.get("FG_BENCH_EXTRACT_P95", "8"))


@dataclass
class TimedRun:
    name: str
    ticker: str
    duration_s: float
    ok: bool
    detail: str = ""
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class BenchmarkReport:
    started_at: str
    finished_at: str
    api_base: str
    tickers: list[str]
    parse_cache_version: int
    thresholds: dict[str, float]
    runs: list[TimedRun]
    summary: dict[str, Any]
    passed: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "api_base": self.api_base,
            "tickers": self.tickers,
            "parse_cache_version": self.parse_cache_version,
            "thresholds": self.thresholds,
            "runs": [asdict(r) for r in self.runs],
            "summary": self.summary,
            "passed": self.passed,
        }


def _p95(values: list[float]) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    return statistics.quantiles(values, n=20)[-1]


def _clear_parsed_cache_for_tickers(tickers: list[str]) -> int:
    """Remove parsed JSON cache entries for tickers (keeps raw HTML on disk)."""
    parsed_dir = _cache_root() / "parsed"
    if not parsed_dir.exists():
        return 0
    want = {t.upper() for t in tickers}
    removed = 0
    for path in list(parsed_dir.glob("*.json.gz")):
        try:
            import gzip

            with gzip.open(path, "rt", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("column", {}).get("ticker", "").upper() in want:
                path.unlink(missing_ok=True)
                removed += 1
        except OSError:
            continue
    return removed


async def _bench_extract_only(ticker: str) -> TimedRun:
    ticker = ticker.upper()
    t0 = time.perf_counter()
    try:
        ticker_map = await fetch_ticker_map()
        resolved = await resolve_ticker(ticker, ticker_map)
        submissions = await fetch_submissions(resolved["cik"])
        filing = find_filing(submissions, fiscal_year=None)
        if not filing:
            raise ValueError("no filing found")
        html = load_filing_html(resolved["cik"], filing["accession_no_dash"])
        if not html:
            html = await fetch_filing_html(resolved["cik"], filing)
        parsed = await asyncio.to_thread(parse_filing_sections, html)
        n_sections = len(parsed.get("sections", []))
        html_mb = len(html) / (1024 * 1024)
        detail = f"{n_sections} sections, html={html_mb:.1f}MB"
        return TimedRun("extract_only", ticker, time.perf_counter() - t0, True, detail, {"sections": n_sections})
    except Exception as exc:
        return TimedRun("extract_only", ticker, time.perf_counter() - t0, False, str(exc))


async def _bench_http_parse(client: httpx.AsyncClient, ticker: str, *, label: str) -> TimedRun:
    ticker = ticker.upper()
    t0 = time.perf_counter()
    try:
        resp = await client.post("/parse", json={"tickers": [ticker], "fiscal_year": None}, timeout=600.0)
        duration = time.perf_counter() - t0
        if resp.status_code != 200:
            return TimedRun(label, ticker, duration, False, f"HTTP {resp.status_code}: {resp.text[:200]}")
        body = resp.json()
        col = body.get("columns", [{}])[0]
        if col.get("error"):
            return TimedRun(label, ticker, duration, False, col["error"])
        n_sections = len(col.get("sections", []))
        from_cache = bool(col.get("from_cache"))
        return TimedRun(
            label,
            ticker,
            duration,
            True,
            f"{n_sections} sections, from_cache={from_cache}",
            {"from_cache": from_cache, "sections": n_sections},
        )
    except Exception as exc:
        return TimedRun(label, ticker, time.perf_counter() - t0, False, str(exc))


async def _bench_http_stream(client: httpx.AsyncClient, tickers: list[str]) -> list[TimedRun]:
    runs: list[TimedRun] = []
    t0 = time.perf_counter()
    first_catalog_s: float | None = None
    try:
        async with client.stream(
            "POST",
            "/parse/stream",
            json={"tickers": tickers, "fiscal_year": None},
            headers={"Accept": "application/x-ndjson"},
            timeout=600.0,
        ) as resp:
            if resp.status_code != 200:
                text = await resp.aread()
                runs.append(
                    TimedRun(
                        "stream_batch",
                        ",".join(tickers),
                        time.perf_counter() - t0,
                        False,
                        f"HTTP {resp.status_code}: {text[:200]!r}",
                    )
                )
                return runs

            buffer = ""
            column_times: dict[str, float] = {}
            async for chunk in resp.aiter_text():
                buffer += chunk
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    if not line.strip():
                        continue
                    event = json.loads(line)
                    if event.get("type") == "catalog" and first_catalog_s is None:
                        first_catalog_s = time.perf_counter() - t0
                    elif event.get("type") == "column":
                        col = event.get("column", {})
                        ticker = col.get("ticker", "?")
                        column_times[ticker] = time.perf_counter() - t0
                    elif event.get("type") == "done":
                        total = time.perf_counter() - t0
                        runs.append(
                            TimedRun(
                                "stream_catalog",
                                "batch",
                                first_catalog_s or total,
                                True,
                                f"catalog before first column",
                            )
                        )
                        runs.append(
                            TimedRun("stream_total", ",".join(tickers), total, True, f"{len(column_times)} columns")
                        )
                        for t, elapsed in sorted(column_times.items(), key=lambda x: x[1]):
                            runs.append(TimedRun("stream_column", t, elapsed, True, "ndjson column event"))
                        return runs
        runs.append(TimedRun("stream_batch", ",".join(tickers), time.perf_counter() - t0, False, "no done event"))
    except Exception as exc:
        runs.append(TimedRun("stream_batch", ",".join(tickers), time.perf_counter() - t0, False, str(exc)))
    return runs


def _summarize_group(runs: list[TimedRun], name: str) -> dict[str, Any]:
    group = [r for r in runs if r.name == name and r.ok]
    durations = [r.duration_s for r in group]
    if not durations:
        return {"name": name, "count": 0, "p50": 0, "p95": 0, "max": 0}
    return {
        "name": name,
        "count": len(durations),
        "p50": round(statistics.median(durations), 3),
        "p95": round(_p95(durations), 3),
        "max": round(max(durations), 3),
    }


def _bottleneck_ranking(runs: list[TimedRun]) -> list[dict[str, Any]]:
    """Rank slowest runs for overnight triage (includes failures)."""
    ranked = sorted(runs, key=lambda r: r.duration_s, reverse=True)
    return [
        {"rank": i + 1, "name": r.name, "ticker": r.ticker, "duration_s": round(r.duration_s, 3), "ok": r.ok, "detail": r.detail}
        for i, r in enumerate(ranked[:15])
    ]


def _evaluate(summary: dict[str, Any], thresholds: dict[str, float], runs: list[TimedRun]) -> tuple[bool, list[str]]:
    failures: list[str] = []
    errors = [r for r in runs if not r.ok and r.name not in ("health", "cache_clear")]
    if errors:
        failures.append(f"{len(errors)} benchmark run(s) failed — see bottlenecks / JSON detail")
    warm = summary.get("http_warm", {})
    cold = summary.get("http_cold", {})
    extract = summary.get("extract_only", {})
    if warm.get("count", 0) and warm["p95"] > thresholds["warm_p95"]:
        failures.append(f"warm p95 {warm['p95']}s > {thresholds['warm_p95']}s")
    if cold.get("count", 0) and cold["p95"] > thresholds["cold_p95"]:
        failures.append(f"cold p95 {cold['p95']}s > {thresholds['cold_p95']}s")
    if extract.get("count", 0) and extract["p95"] > thresholds["extract_p95"]:
        failures.append(f"extract p95 {extract['p95']}s > {thresholds['extract_p95']}s")
    return len(failures) == 0, failures


def format_text_report(report: BenchmarkReport) -> str:
    lines = [
        f"FilingGrid benchmark — {report.finished_at}",
        f"API: {report.api_base}  tickers: {', '.join(report.tickers)}  cache v{report.parse_cache_version}",
        f"PASS: {'YES' if report.passed else 'NO'}",
        "",
        "Thresholds:",
        f"  warm p95  < {report.thresholds['warm_p95']}s",
        f"  cold p95  < {report.thresholds['cold_p95']}s",
        f"  extract   < {report.thresholds['extract_p95']}s",
        "",
        "Summary:",
    ]
    for key, block in report.summary.items():
        if isinstance(block, dict) and "p95" in block:
            lines.append(f"  {key}: p50={block['p50']}s p95={block['p95']}s max={block['max']}s (n={block['count']})")
    if report.summary.get("failures"):
        lines.extend(["", "Failures:"])
        for f in report.summary["failures"]:
            lines.append(f"  - {f}")
    lines.extend(["", "Top bottlenecks:"])
    for row in report.summary.get("bottlenecks", []):
        lines.append(f"  {row['rank']}. {row['name']} {row['ticker']}: {row['duration_s']}s — {row['detail']}")
    return "\n".join(lines)


async def run_benchmark(
    *,
    api_base: str,
    tickers: list[str],
    cold: bool,
    extract_only: bool,
    skip_http: bool,
) -> BenchmarkReport:
    started = datetime.now(timezone.utc).isoformat()
    runs: list[TimedRun] = []
    thresholds = {"warm_p95": WARM_P95_LIMIT_S, "cold_p95": COLD_P95_LIMIT_S, "extract_p95": EXTRACT_P95_LIMIT_S}

    if not skip_http:
        async with httpx.AsyncClient(base_url=api_base.rstrip("/")) as client:
            try:
                health = await client.get("/health", timeout=10.0)
                runs.append(
                    TimedRun(
                        "health",
                        "api",
                        0,
                        health.status_code == 200,
                        health.text[:80],
                    )
                )
            except Exception as exc:
                runs.append(TimedRun("health", "api", 0, False, str(exc)))

    for ticker in tickers:
        runs.append(await _bench_extract_only(ticker))

    if not skip_http:
        async with httpx.AsyncClient(base_url=api_base.rstrip("/")) as client:
            for ticker in tickers:
                runs.append(await _bench_http_parse(client, ticker, label="http_warm"))

            if cold:
                removed = _clear_parsed_cache_for_tickers(tickers)
                runs.append(TimedRun("cache_clear", "batch", 0, True, f"removed {removed} parsed entries"))
                for ticker in tickers:
                    runs.append(await _bench_http_parse(client, ticker, label="http_cold"))

            runs.extend(await _bench_http_stream(client, tickers))

    summary = {
        "extract_only": _summarize_group(runs, "extract_only"),
        "http_warm": _summarize_group(runs, "http_warm"),
        "http_cold": _summarize_group(runs, "http_cold"),
        "stream_catalog": _summarize_group(runs, "stream_catalog"),
        "stream_column": _summarize_group(runs, "stream_column"),
        "bottlenecks": _bottleneck_ranking(runs),
    }
    passed, failures = _evaluate(summary, thresholds, runs)
    summary["failures"] = failures

    finished = datetime.now(timezone.utc).isoformat()
    return BenchmarkReport(
        started_at=started,
        finished_at=finished,
        api_base=api_base,
        tickers=tickers,
        parse_cache_version=PARSE_CACHE_VERSION,
        thresholds=thresholds,
        runs=runs,
        summary=summary,
        passed=passed,
    )


async def _main_async(args: argparse.Namespace) -> int:
    if args.extract_only:
        args.skip_http = True

    report = await run_benchmark(
        api_base=args.api,
        tickers=[t.upper() for t in args.tickers],
        cold=args.cold,
        extract_only=args.extract_only,
        skip_http=args.skip_http,
    )
    await close_http_client()

    text = format_text_report(report)
    print(text)

    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report.to_dict(), indent=2), encoding="utf-8")
        txt_path = out.with_suffix(".txt")
        txt_path.write_text(text, encoding="utf-8")
        print(f"\nWrote {out} and {txt_path}")

    return 0 if report.passed else 1


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark FilingGrid /parse performance")
    parser.add_argument("--api", default=DEFAULT_API, help="FastAPI base URL")
    parser.add_argument("--tickers", nargs="+", default=DEFAULT_TICKERS[:3], help="Tickers to benchmark")
    parser.add_argument("--cold", action="store_true", help="Clear parsed cache and re-run (HTML retained)")
    parser.add_argument("--extract-only", action="store_true", help="Only benchmark BeautifulSoup extraction")
    parser.add_argument("--skip-http", action="store_true", help="Skip HTTP endpoints (health/parse/stream)")
    parser.add_argument("-o", "--output", help="Write JSON report to this path")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(_main_async(args)))


if __name__ == "__main__":
    main()
