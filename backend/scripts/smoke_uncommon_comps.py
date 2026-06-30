"""Smoke uncommon comps against production API."""
from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass, field

import httpx

API = os.environ.get(
    "FILINGGRID_API",
    os.environ.get("NEXT_PUBLIC_API_URL", "https://peerdisclosures-api.onrender.com"),
)
HEADERS = {"Accept": "application/x-ndjson", "X-Dev-Tier": "professional"}
FISCAL_YEAR = 2024
THROTTLE_S = 1.5

SCENARIOS = [
    {"comp": "reit-net-lease", "tickers": ["O", "SPG", "PLD"], "fiscal_year": 2024, "period": None, "notes": "REIT trio"},
    {"comp": "utilities-regulated", "tickers": ["NEE", "DUK", "SO"], "fiscal_year": 2024, "period": None, "notes": "utilities"},
    {"comp": "biotech-vaccine-ish", "tickers": ["MRNA", "BNTX", "SRPT"], "fiscal_year": 2024, "period": None, "notes": "biotech one-offs"},
    {"comp": "adr-eu-us-mix", "tickers": ["SAP", "NVO", "ORCL"], "fiscal_year": 2024, "period": None, "notes": "EU 20-F ADRs + US 10-K (not in popular catalog)"},
    {"comp": "mining-adr", "tickers": ["VALE", "RIO", "FCX"], "fiscal_year": 2024, "period": None, "notes": "Brazil/Chile ADR + US"},
    {"comp": "space-smallcap", "tickers": ["RKLB", "ASTS"], "fiscal_year": 2024, "period": None, "notes": "2-col speculative"},
    {"comp": "telecom", "tickers": ["TMUS", "VZ", "T"], "fiscal_year": 2024, "period": None, "notes": "wireline/wireless"},
    {"comp": "casinos", "tickers": ["LVS", "WYNN", "MGM"], "fiscal_year": 2024, "period": None, "notes": "gaming REIT-adjacent"},
    {"comp": "dc-reit", "tickers": ["EQIX", "DLR", "AMT"], "fiscal_year": 2024, "period": None, "notes": "data center / tower REITs"},
    {"comp": "midstream", "tickers": ["KMI", "WMB", "OKE"], "fiscal_year": 2024, "period": None, "notes": "energy midstream"},
    {"comp": "semi-niche", "tickers": ["MRVL", "ON", "QRVO"], "fiscal_year": 2024, "period": None, "notes": "not NVDA/AMD/INTC"},
    {"comp": "insurance-conglomerate", "tickers": ["BRK-B", "MKL", "AJG"], "fiscal_year": 2024, "period": None, "notes": "BRK-B hyphen"},
    {"comp": "water-utilities", "tickers": ["AWK", "WTRG", "CWT"], "fiscal_year": 2024, "period": None, "notes": "water"},
    {"comp": "canadian-banks-adr", "tickers": ["RY", "TD", "BNS"], "fiscal_year": 2024, "period": None, "notes": "US-listed Canadian"},
    {"comp": "mreit", "tickers": ["AGNC", "NLY", "TWO"], "fiscal_year": 2024, "period": None, "notes": "mortgage REIT"},
    {"comp": "japan-adr-gaming", "tickers": ["SONY", "NTDOY", "SE"], "fiscal_year": 2024, "period": None, "notes": "JP ADR + Square Enix ADR"},
    {"comp": "interim-q1-biotech", "tickers": ["ABBV", "GILD"], "fiscal_year": 2025, "period": "interim-2025-Q1", "notes": "Q1 10-Q vs annual mix"},
    {"comp": "obscure-retail-duo", "tickers": ["PRPL", "LOVE"], "fiscal_year": 2024, "period": None, "notes": "small cap retail"},
    {"comp": "free-tier-402-probe", "tickers": ["O", "SPG", "PLD", "EQIX"], "fiscal_year": 2024, "period": None, "notes": "4-ticker no pro header", "no_pro": True},
]

@dataclass
class Row:
    comp: str
    tickers: list[str]
    period: str
    parse: str = ""
    fin: str = ""
    errors: str = ""
    notes: str = ""


async def throttle():
    await asyncio.sleep(THROTTLE_S)


async def smoke_parse(client: httpx.AsyncClient, tickers, fy, period, headers) -> tuple[str, str]:
    body = {"tickers": tickers}
    if fy is not None:
        body["fiscal_year"] = fy
    if period:
        body["period"] = period
    r = await client.post(f"{API}/parse/stream", json=body, headers=headers)
    if r.status_code == 402:
        return "402", "paywall/limit"
    if r.status_code != 200:
        return f"HTTP{r.status_code}", (r.text or "")[:180]
    cols = {}
    forms = {}
    for line in r.text.strip().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("type") != "column":
            continue
        col = row.get("column") or {}
        t = str(col.get("ticker", "")).upper()
        if col.get("error"):
            cols[t] = str(col["error"])[:100]
        else:
            cols[t] = "ok"
            forms[t] = col.get("form") or ""
    missing = [t for t in tickers if t.upper() not in cols]
    errs = {t: m for t, m in cols.items() if m != "ok"}
    detail = []
    if forms:
        detail.append("forms=" + ",".join(f"{k}:{v}" for k, v in sorted(forms.items())))
    if missing:
        detail.append("missing=" + ",".join(missing))
    if errs:
        detail.append("col_err=" + json.dumps(errs)[:200])
    status = "ok" if not missing and not errs else "partial" if cols else "fail"
    return status, "; ".join(detail) if detail else "all columns ok"


async def smoke_fin(client: httpx.AsyncClient, tickers, fy, period, headline_only=True) -> tuple[str, str]:
    body = {"tickers": tickers, "fiscal_year": fy, "headline_only": headline_only}
    if period:
        body["period"] = period
    r = await client.post(f"{API}/filings/financials/batch", json=body, headers=HEADERS)
    if r.status_code != 200:
        return f"HTTP{r.status_code}", (r.text or "")[:180]
    loaded = {}
    for line in r.text.strip().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("type") != "financial":
            continue
        t = str(row.get("ticker", "")).upper()
        if row.get("error"):
            loaded[t] = {"error": str(row["error"])[:100]}
            continue
        fin = row.get("financials") or {}
        notes = fin.get("notes_xbrl") or {}
        loaded[t] = {
            "rows": len(fin.get("annual_summary") or []),
            "notes": len(notes),
            "notes_data": sum(1 for n in notes.values() if (n.get("disclosures") or []) or (n.get("annual_summary") or [])),
            "headline": fin.get("headline_only"),
        }
    missing = [t for t in tickers if t.upper() not in loaded]
    empty = [t for t, i in loaded.items() if "error" not in i and i.get("rows", 0) == 0]
    sparse = [t for t, i in loaded.items() if "error" not in i and i.get("notes_data", 0) == 0]
    errs = {t: i["error"] for t, i in loaded.items() if "error" in i}
    status = "ok"
    if errs or missing:
        status = "fail"
    elif empty or sparse:
        status = "warn"
    parts = []
    for t in tickers:
        info = loaded.get(t.upper(), {})
        if info:
            parts.append(f"{t}:r{info.get('rows',0)}n{info.get('notes_data',0)}")
    if errs:
        parts.append("err=" + json.dumps(errs)[:200])
    if missing:
        parts.append("missing=" + ",".join(missing))
    if empty:
        parts.append("empty_rows=" + ",".join(empty))
    if sparse:
        parts.append("sparse_notes=" + ",".join(sparse))
    return status, "; ".join(parts)


async def main():
    print(f"API={API} FY default={FISCAL_YEAR} scenarios={len(SCENARIOS)}\n")
    rows: list[Row] = []
    async with httpx.AsyncClient(timeout=300.0) as client:
        # health
        try:
            h = await client.get(f"{API}/health")
            print(f"health: {h.status_code} {h.text[:120]}\n")
        except Exception as e:
            print(f"health failed: {e}\n")
        first_fin_ticker = None
        for sc in SCENARIOS:
            tickers = [t.upper() for t in sc["tickers"]]
            fy = sc.get("fiscal_year", FISCAL_YEAR)
            period = sc.get("period")
            period_label = period or f"FY{fy}"
            headers = {"Accept": "application/x-ndjson"} if sc.get("no_pro") else HEADERS
            await throttle()
            pstat, pdet = await smoke_parse(client, tickers, fy, period, headers)
            await throttle()
            if sc.get("no_pro") and pstat == "402":
                fstat, fdet = "skip", "expected 402 on parse"
            else:
                fstat, fdet = await smoke_fin(client, tickers, fy, period)
            if first_fin_ticker is None and tickers and not sc.get("no_pro"):
                first_fin_ticker = tickers[0]
            row = Row(
                comp=sc["comp"],
                tickers=tickers,
                period=period_label,
                parse=f"{pstat} ({pdet})" if pdet else pstat,
                fin=f"{fstat} ({fdet})" if fdet else fstat,
                errors="",
                notes=sc.get("notes", ""),
            )
            rows.append(row)
            print(f"[{sc['comp']}] parse={pstat} fin={fstat} | {tickers}")
            if pstat not in ("ok", "402") or fstat == "fail":
                print(f"    parse: {pdet}")
                print(f"    fin: {fdet}")
        if first_fin_ticker:
            await throttle()
            r = await client.get(
                f"{API}/filings/{first_fin_ticker}/financials",
                params={"fiscal_year": FISCAL_YEAR, "headline_only": "false"},
                headers=HEADERS,
            )
            print(f"\nGET full financials {first_fin_ticker}: HTTP {r.status_code}")
            if r.status_code == 200:
                fin = r.json()
                notes = fin.get("notes_xbrl") or {}
                print(f"  rows={len(fin.get('annual_summary') or [])} notes={len(notes)} entity={fin.get('entity_name','')[:40]}")

    print("\n=== MATRIX ===")
    print("comp|tickers|period|parse|fin|errors|notes")
    for r in rows:
        print(
            f"{r.comp}|{','.join(r.tickers)}|{r.period}|{r.parse}|{r.fin}|{r.errors}|{r.notes}"
        )

if __name__ == "__main__":
    asyncio.run(main())
