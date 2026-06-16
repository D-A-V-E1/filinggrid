import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bs4 import BeautifulSoup

from sec.client import close_http_client, fetch_filing_html, fetch_submissions, find_filing, resolve_ticker
from sec.section_extractor import parse_filing_section_index

MAJOR = ["business", "risk-factors", "mda", "market-risk", "financial-statements", "controls"]
FORM_TYPES = {
    "10-q": ["10-Q", "10-Q/A"],
    "6-k": ["6-K"],
}


async def check(ticker: str, form_types: list[str] | None = None) -> None:
    r = await resolve_ticker(ticker)
    subs = await fetch_submissions(r["cik"])
    f = find_filing(subs, form_types=form_types) or find_filing(subs, form_types=form_types, fiscal_year=None)
    html = await fetch_filing_html(r["cik"], f)
    idx = parse_filing_section_index(html)
    soup = BeautifulSoup(html, "html.parser")
    frags = {str(t.get("id")) for t in soup.find_all(True) if t.get("id")}
    print(f"=== {ticker} {f['form']} sections={len(idx['sections'])} ===")
    for sid in MAJOR:
        sec = next((s for s in idx["sections"] if s["id"] == sid), None)
        if sec:
            a = sec.get("anchor")
            ok = a in frags if a else False
            print(f"  {sid}: anchor={a!r} exists={ok} heading={sec.get('heading', '')[:70]}")
        else:
            print(f"  {sid}: MISSING")
    item8 = sorted(x for x in frags if x and "item_8" in x.lower())[:10]
    print("  item_8 frags:", item8)
    missing = [s for s in idx["sections"] if s["id"] in MAJOR and not s.get("anchor")]
    if missing:
        print("  NO ANCHOR:")
        for s in missing:
            print(f"    {s['id']}: {s.get('heading','')[:90]}")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("tickers", nargs="*")
    parser.add_argument("--forms", choices=sorted(FORM_TYPES))
    args = parser.parse_args()
    form_types = FORM_TYPES.get(args.forms) if args.forms else None
    tickers = args.tickers or ["AAPL", "TM", "TSLA", "GM", "SAP", "ASML", "NVO"]
    for t in tickers:
        await check(t, form_types)
    await close_http_client()


if __name__ == "__main__":
    asyncio.run(main())
