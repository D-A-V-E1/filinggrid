"""Uncommon comp subset for overnight smoke (imports scenarios from backend script)."""
from __future__ import annotations

import asyncio
import importlib.util
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SMOKE_PATH = ROOT / "backend" / "scripts" / "smoke_uncommon_comps.py"

spec = importlib.util.spec_from_file_location("smoke_uncommon_comps", SMOKE_PATH)
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)

API = os.environ.get("FILINGGRID_API", mod.API)
THROTTLE_S = float(os.environ.get("FILINGGRID_THROTTLE_S", "5"))
MAX_SCENARIOS = int(os.environ.get("OVERNIGHT_UNCOMMON_COUNT", "9"))
USE_LATEST_FY = os.environ.get("FILINGGRID_FY", "latest").lower() in ("", "latest", "null", "none")

SCENARIOS = mod.SCENARIOS[:MAX_SCENARIOS]


async def main() -> int:
    import httpx

    print(f"API={API} scenarios={len(SCENARIOS)} latest_fy={USE_LATEST_FY}")
    fails = 0
    warns = 0
    async with httpx.AsyncClient(timeout=300.0) as client:
        for sc in SCENARIOS:
            tickers = [t.upper() for t in sc["tickers"]]
            fy = None if USE_LATEST_FY else sc.get("fiscal_year", mod.FISCAL_YEAR)
            period = sc.get("period")
            headers = {"Accept": "application/x-ndjson"} if sc.get("no_pro") else mod.HEADERS
            await asyncio.sleep(THROTTLE_S)
            pstat, pdet = await mod.smoke_parse(client, tickers, fy, period, headers)
            await asyncio.sleep(THROTTLE_S)
            if sc.get("no_pro") and pstat == "402":
                fstat, fdet = "skip", "expected 402"
                warns += 1
            elif pstat == "402":
                fstat, fdet = "skip", "402 warn"
                warns += 1
            else:
                fstat, fdet = await mod.smoke_fin(client, tickers, fy, period)
            print(f"[{sc['comp']}] parse={pstat} fin={fstat}")
            if pstat == "402":
                warns += 1
            elif pstat not in ("ok", "partial"):
                fails += 1
            elif fstat == "fail":
                fails += 1
            elif fstat == "warn":
                warns += 1
    print(f"uncommon subset: fails={fails} warns={warns}")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
