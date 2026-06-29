"""Smoke-test Pro compare: parse stream + financials batch for popular comp groups."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

import httpx

API = os.environ.get(
    "FILINGGRID_API",
    os.environ.get("NEXT_PUBLIC_API_URL", "http://localhost:8000"),
)
HEADERS_PRO = {"Accept": "application/x-ndjson", "X-Dev-Tier": "professional"}
FISCAL_YEAR = int(os.environ.get("FILINGGRID_FY", str(__import__("datetime").datetime.now().year - 1)))
REQUEST_TIMEOUT = float(os.environ.get("FILINGGRID_TIMEOUT", "300"))
CATALOG_PATH = (
    Path(__file__).resolve().parents[2] / "data" / "popular-peer-groups.json"
)


def load_popular_groups() -> list[dict]:
    data = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    groups: list[dict] = []
    for section in data.get("sections", []):
        for group in section.get("groups", []):
            groups.append(
                {
                    "id": group["id"],
                    "label": group.get("label", group["id"]),
                    "tickers": [t.upper() for t in group["tickers"]],
                }
            )
    return groups


async def smoke_parse(client: httpx.AsyncClient, tickers: list[str], fiscal_year: int) -> tuple[bool, str, dict[str, str]]:
    r = await client.post(
        f"{API}/parse/stream",
        json={"tickers": tickers, "fiscal_year": fiscal_year},
        headers=HEADERS_PRO,
    )
    if r.status_code == 402:
        return False, f"parse blocked (402): {r.text[:200]}", {}
    if r.status_code != 200:
        return False, f"parse HTTP {r.status_code}: {r.text[:200]}", {}

    columns: dict[str, str] = {}
    for line in r.text.strip().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("type") != "column":
            continue
        col = row.get("column") or {}
        ticker = str(col.get("ticker", "")).upper()
        if col.get("error"):
            columns[ticker] = str(col["error"])[:120]
        else:
            columns[ticker] = "ok"

    missing = [t for t in tickers if t not in columns]
    if missing:
        return False, f"parse missing columns: {missing}", columns
    errors = {t: msg for t, msg in columns.items() if msg != "ok"}
    if errors:
        return False, f"parse column errors: {errors}", columns
    return True, f"parse ok ({len(columns)} columns)", columns


async def smoke_financials_batch(
    client: httpx.AsyncClient,
    tickers: list[str],
    fiscal_year: int,
    *,
    headline_only: bool,
) -> tuple[bool, str, dict[str, dict]]:
    r = await client.post(
        f"{API}/filings/financials/batch",
        json={
            "tickers": tickers,
            "fiscal_year": fiscal_year,
            "headline_only": headline_only,
        },
        headers=HEADERS_PRO,
    )
    if r.status_code != 200:
        return False, f"financials HTTP {r.status_code}: {r.text[:200]}", {}

    loaded: dict[str, dict] = {}
    for line in r.text.strip().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("type") != "financial":
            continue
        ticker = str(row.get("ticker", "")).upper()
        if row.get("error"):
            loaded[ticker] = {"error": str(row["error"])[:120]}
            continue
        fin = row.get("financials") or {}
        notes = fin.get("notes_xbrl") or {}
        loaded[ticker] = {
            "headline_only": fin.get("headline_only"),
            "annual_rows": len(fin.get("annual_summary") or []),
            "notes_keys": len(notes),
            "notes_with_data": sum(
                1
                for n in notes.values()
                if (n.get("disclosures") or []) or (n.get("annual_summary") or [])
            ),
        }

    missing = [t for t in tickers if t not in loaded]
    if missing:
        return False, f"financials missing tickers: {missing}", loaded
    empty = [t for t, info in loaded.items() if info.get("annual_rows", 0) == 0 and "error" not in info]
    errors = {t: info["error"] for t, info in loaded.items() if "error" in info}
    if errors:
        return False, f"financials errors: {errors}", loaded
    if empty:
        return False, f"financials empty annual_summary: {empty}", loaded
    mode = "headline" if headline_only else "full"
    return True, f"financials {mode} ok ({len(loaded)} tickers)", loaded


async def smoke_full_upgrade(
    client: httpx.AsyncClient,
    tickers: list[str],
    fiscal_year: int,
    headline_info: dict[str, dict],
) -> tuple[bool, str, dict[str, dict]]:
    """Per-ticker full financials fetch (mirrors frontend upgrade path)."""
    full_info: dict[str, dict] = {}
    failures: list[str] = []
    for ticker in tickers:
        head = headline_info.get(ticker, {})
        if head.get("notes_keys", 0) > 0 and head.get("headline_only") is not True:
            full_info[ticker] = head
            continue
        r = await client.get(
            f"{API}/filings/{ticker}/financials",
            params={"fiscal_year": fiscal_year, "headline_only": "false"},
            headers=HEADERS_PRO,
        )
        if r.status_code != 200:
            failures.append(f"{ticker}: HTTP {r.status_code}")
            continue
        fin = r.json()
        notes = fin.get("notes_xbrl") or {}
        full_info[ticker] = {
            "headline_only": fin.get("headline_only"),
            "annual_rows": len(fin.get("annual_summary") or []),
            "notes_keys": len(notes),
            "notes_with_data": sum(
                1
                for n in notes.values()
                if (n.get("disclosures") or []) or (n.get("annual_summary") or [])
            ),
        }
        if full_info[ticker]["annual_rows"] == 0:
            failures.append(f"{ticker}: empty annual_summary after full upgrade")
    if failures:
        return False, "; ".join(failures), full_info
    return True, f"full upgrade ok ({len(full_info)} tickers)", full_info


async def audit_group(
    client: httpx.AsyncClient,
    group: dict,
    fiscal_year: int,
) -> tuple[bool, list[str]]:
    tickers: list[str] = group["tickers"]
    label = group["label"]
    gid = group["id"]
    issues: list[str] = []

    parse_ok, parse_msg, _ = await smoke_parse(client, tickers, fiscal_year)
    if not parse_ok:
        issues.append(f"parse: {parse_msg}")

    head_ok, head_msg, head_info = await smoke_financials_batch(
        client, tickers, fiscal_year, headline_only=True
    )
    if not head_ok:
        issues.append(f"headline financials: {head_msg}")

    if head_ok:
        full_ok, full_msg, full_info = await smoke_full_upgrade(
            client, tickers, fiscal_year, head_info
        )
        if not full_ok:
            issues.append(f"full upgrade: {full_msg}")
        else:
            sparse_notes = [
                t
                for t in tickers
                if full_info.get(t, {}).get("notes_with_data", 0) == 0
            ]
            if sparse_notes:
                issues.append(f"sparse notes_xbrl after full: {sparse_notes} (warn)")

    status = "PASS" if not [i for i in issues if not i.endswith("(warn)")] else "FAIL"
    print(f"[{status}] {gid} — {label}")
    print(f"       tickers: {', '.join(tickers)}")
    if parse_ok:
        print(f"       parse: {parse_msg}")
    if head_ok:
        print(f"       headline: {head_msg}")
        for t in tickers:
            info = head_info.get(t, {})
            print(f"         {t}: rows={info.get('annual_rows')}, notes={info.get('notes_keys')}")
    for issue in issues:
        print(f"       ! {issue}")
    return len([i for i in issues if not i.endswith("(warn)")]) == 0, issues


async def main() -> int:
    groups = load_popular_groups()
    print(f"API: {API}")
    print(f"Fiscal year: {FISCAL_YEAR}")
    print(f"Popular comp groups: {len(groups)}\n")

    failures = 0
    all_issues: dict[str, list[str]] = {}
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        for group in groups:
            ok, issues = await audit_group(client, group, FISCAL_YEAR)
            if not ok:
                failures += 1
                all_issues[group["id"]] = issues
            print()

    unique_tickers = sorted({t for g in groups for t in g["tickers"]})
    print(f"Unique tickers audited: {len(unique_tickers)}")
    if failures:
        print(f"\n{failures}/{len(groups)} group(s) failed.")
        return 1
    print(f"\nAll {len(groups)} popular comp groups passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
