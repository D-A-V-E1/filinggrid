"""
Audit SEC EDGAR section anchors across filings.

Validates that parsed section anchors (and frontend fallbacks) resolve to real
fragment ids in each filing HTML document.

Usage:
  backend\\.venv\\Scripts\\python.exe backend/scripts/audit_section_anchors.py
  backend\\.venv\\Scripts\\python.exe backend/scripts/audit_section_anchors.py --forms 10-q
  backend\\.venv\\Scripts\\python.exe backend/scripts/audit_section_anchors.py --forms 6-k
  backend\\.venv\\Scripts\\python.exe backend/scripts/audit_section_anchors.py --tickers AAPL TM SAP
  backend\\.venv\\Scripts\\python.exe backend/scripts/audit_section_anchors.py --peers tsla-vs-tm-vs-gm
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from sec.client import (
    ANNUAL_COMPARABLE_FORMS,
    INTERIM_COMPARABLE_FORMS,
    close_http_client,
    fetch_filing_html,
    fetch_submissions,
    find_filing,
    resolve_ticker,
)
from sec.section_extractor import parse_filing_section_index

# Mirror lib/sec-url.ts fallbacks for when anchor is missing in API response.
SECTION_ANCHOR_FALLBACKS: dict[str, str] = {
    "business": "item_1_business",
    "risk-factors": "item_1a_risk_factors",
    "unresolved-staff": "item_1b",
    "properties": "item_2_properties",
    "legal-proceedings": "item_3_legal_proceedings",
    "mine-safety": "item_4",
    "mda": "item_7",
    "market-risk": "item_7a",
    "financial-statements": "item_8",
    "disagreements": "item_9",
    "controls": "item_9a",
    "other-info": "item_9b",
}


MAJOR_SECTIONS = frozenset({
    "business", "risk-factors", "unresolved-staff", "properties",
    "legal-proceedings", "mine-safety", "mda", "market-risk",
    "financial-statements", "disagreements", "controls", "other-info",
})


def resolve_section_anchor_frontend(
    section_id: str,
    anchor: str | None,
    heading: str | None,
) -> str | None:
    """Python port of lib/sec-url.ts resolveSectionAnchor."""
    if anchor:
        return anchor
    if section_id.startswith("note-"):
        return None

    heading_item = None
    if heading:
        m = re.search(r"item\s+(\d+[a-z]?)\b", heading, re.IGNORECASE)
        if m:
            heading_item = m.group(1).lower()

    if section_id == "mda":
        if heading_item == "5":
            return "item_5_operating_and_financial_review"
        if heading_item == "2":
            return "item_2_managements_discussion_analysis_f"
        if heading and re.search(r"operating and financial review", heading, re.I):
            return "item_5_operating_and_financial_review"
        if heading and re.search(r"management.s discussion", heading, re.I):
            return (
                "item_2_managements_discussion_analysis_f"
                if heading_item == "2"
                else SECTION_ANCHOR_FALLBACKS.get("mda")
            )
        return SECTION_ANCHOR_FALLBACKS.get("mda")
    if section_id == "risk-factors":
        if heading and re.match(r"^\s*[A-Z]\.\s*RISK FACTORS", heading, re.I):
            return "item_3d_risk_factors"
        if heading_item == "3":
            return "item_3d_risk_factors"
        return "item_1a_risk_factors"
    if section_id == "business" and heading_item == "4":
        return "item_4_information_on_the_company"
    if section_id == "market-risk":
        if heading_item == "3":
            return "item_3_quantitative_qualitative_disclosu"
        if heading and re.search(r"item\s*11", heading, re.I):
            return "item_11_quantitative_qualitative_disclosu"
        if heading and re.search(
            r"quantitative and qualitative disclosures about market risk", heading, re.I
        ):
            return "item_11_quantitative_qualitative_disclosu"
        return SECTION_ANCHOR_FALLBACKS.get("market-risk")
    if section_id == "financial-statements" and heading_item == "1":
        return "item_1_financial_statements"
    if section_id == "financial-statements" and heading and re.search(
        r"condensed consolidated financial", heading, re.I
    ):
        return "item_1_financial_statements"
    if section_id == "financial-statements" and heading_item == "8":
        return "item_8_financial_information"
    if section_id == "legal-proceedings" and heading_item == "1":
        return "item_1_legal_proceedings"
    if section_id == "controls" and heading_item == "4":
        return "item_4_controls_procedures"
    if section_id == "controls" and heading and re.search(r"item\s*15", heading, re.I):
        return "item_15_controls_and_procedures"
    if section_id == "business" and heading and re.search(r"information on the company", heading, re.I):
        return "item_4_information_on_the_company"

    fallback = SECTION_ANCHOR_FALLBACKS.get(section_id)
    if fallback:
        return fallback

    if heading_item:
        if heading_item == "1a":
            return "item_1a_risk_factors"
        if heading_item == "2":
            return "item_2_managements_discussion_analysis_f"
        if heading_item == "3":
            return "item_3_quantitative_qualitative_disclosu"
        if heading_item == "4":
            return "item_4_controls_procedures"
        if heading_item == "7":
            return "item_7"
        if heading_item == "7a":
            return "item_7a"
        if heading_item == "8":
            return "item_8"
        if heading_item == "9a":
            return "item_9a"
    return None


def collect_fragments(html_bytes: bytes) -> set[str]:
    soup = BeautifulSoup(html_bytes, "html.parser")
    fragments: set[str] = set()
    for tag in soup.find_all(True):
        element_id = tag.get("id")
        if element_id:
            fragments.add(str(element_id))
        name = tag.get("name")
        if name:
            fragments.add(str(name))
    return fragments


def fragment_exists(fragments: set[str], anchor: str) -> bool:
    if anchor in fragments:
        return True
    # EDGAR sometimes truncates long ids in TOC vs document
    for frag in fragments:
        if frag.startswith(anchor) or anchor.startswith(frag):
            if len(frag) >= 8 and len(anchor) >= 8:
                return True
    return False


@dataclass
class AnchorIssue:
    ticker: str
    form: str
    section_id: str
    heading: str
    anchor: str | None
    resolved: str | None
    issue: str


@dataclass
class TickerReport:
    ticker: str
    form: str
    sections: int
    issues: list[AnchorIssue] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return len(self.issues) == 0


DEFAULT_TICKERS_10Q = ["AAPL", "MSFT", "JPM", "NVDA", "TSLA", "GM", "KO", "WMT"]
DEFAULT_TICKERS_6K = ["TM", "SAP", "ASML", "NVO", "SONY"]

DEFAULT_TICKERS = [
    "AAPL", "MSFT", "JPM", "NVDA",
    "TM", "SAP", "ASML", "NVO", "SONY",
    "TSLA", "GM", "BRK-B", "KO", "WMT",
]

FORM_PRESETS: dict[str, list[str]] = {
    "annual": list(ANNUAL_COMPARABLE_FORMS) + list(INTERIM_COMPARABLE_FORMS),
    "10-q": ["10-Q", "10-Q/A"],
    "10-qa": ["10-Q", "10-Q/A"],
    "6-k": ["6-K"],
}

PEER_GROUPS = {
    "tsla-vs-tm-vs-gm": ["TSLA", "TM", "GM"],
    "aapl-vs-msft": ["AAPL", "MSFT"],
    "sap-vs-asml-vs-nvo": ["SAP", "ASML", "NVO"],
    "jpm-vs-gs-vs-ms": ["JPM", "GS", "MS"],
}


async def audit_ticker(
    ticker: str,
    fiscal_year: int | None,
    form_types: list[str] | None = None,
) -> TickerReport:
    resolved = await resolve_ticker(ticker)
    submissions = await fetch_submissions(resolved["cik"])
    filing = find_filing(submissions, form_types=form_types, fiscal_year=fiscal_year)
    if not filing:
        filing = find_filing(submissions, form_types=form_types, fiscal_year=None)
    if not filing:
        return TickerReport(ticker=ticker, form="?", sections=0, issues=[
            AnchorIssue(ticker, "?", "?", "", None, None, "no filing found")
        ])

    html = await fetch_filing_html(resolved["cik"], filing)
    fragments = collect_fragments(html)
    index = parse_filing_section_index(html)
    sections = index.get("sections") or []

    issues: list[AnchorIssue] = []
    for section in sections:
        section_id = section["id"]
        if section_id == "full-document" or section_id not in MAJOR_SECTIONS:
            continue
        anchor = section.get("anchor")
        heading = section.get("heading") or ""
        resolved_anchor = resolve_section_anchor_frontend(section_id, anchor, heading)

        if not resolved_anchor:
            issues.append(AnchorIssue(
                ticker, filing["form"], section_id, heading, anchor, None, "no anchor resolved"
            ))
            continue

        if not fragment_exists(fragments, resolved_anchor):
            issues.append(AnchorIssue(
                ticker, filing["form"], section_id, heading, anchor, resolved_anchor,
                f"fragment '{resolved_anchor}' not in document",
            ))

    return TickerReport(ticker=ticker, form=filing["form"], sections=len(sections), issues=issues)


def peer_consistency(reports: list[TickerReport]) -> list[str]:
    """Flag major sections present in some columns but broken/missing in others."""
    major = {
        "business", "risk-factors", "mda", "market-risk", "financial-statements", "controls"
    }
    by_section: dict[str, dict[str, str]] = {sid: {} for sid in major}

    for report in reports:
        broken = {i.section_id for i in report.issues}
        for sid in major:
            if report.sections == 0:
                by_section[sid][report.ticker] = "no filing"
            elif sid in broken:
                by_section[sid][report.ticker] = "broken"
            else:
                by_section[sid][report.ticker] = "ok"

    warnings: list[str] = []
    for sid, status in by_section.items():
        vals = set(status.values())
        if len(vals) > 1 and "ok" in vals:
            warnings.append(f"{sid}: inconsistent across peer group — {status}")
    return warnings


async def main() -> int:
    parser = argparse.ArgumentParser(description="Audit SEC section anchor links")
    parser.add_argument("--tickers", nargs="*", default=None)
    parser.add_argument("--peers", nargs="*", default=None, help="Peer slug keys from PEER_GROUPS")
    parser.add_argument("--forms", nargs="*", default=None, help="Form preset: annual, 10-q, 6-k")
    parser.add_argument("--year", type=int, default=None)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    tickers: list[str] = []
    if args.peers:
        for slug in args.peers:
            tickers.extend(PEER_GROUPS.get(slug, slug.upper().split("-VS-")))
    if args.tickers:
        tickers.extend(t.upper() for t in args.tickers)
    if not tickers:
        form_key = (args.forms[0].lower() if args.forms else "annual")
        if form_key in ("10-q", "10-qa"):
            tickers = DEFAULT_TICKERS_10Q
        elif form_key == "6-k":
            tickers = DEFAULT_TICKERS_6K
        else:
            tickers = DEFAULT_TICKERS

    form_types: list[str] | None = None
    if args.forms:
        preset = args.forms[0].lower()
        form_types = FORM_PRESETS.get(preset, args.forms)

    tickers = list(dict.fromkeys(tickers))
    reports: list[TickerReport] = []

    try:
        for ticker in tickers:
            print(f"Auditing {ticker}...", flush=True)
            report = await audit_ticker(ticker, args.year, form_types)
            reports.append(report)
            status = "OK" if report.ok else f"{len(report.issues)} issue(s)"
            print(f"  {ticker} ({report.form}): {report.sections} sections — {status}")
            for issue in report.issues:
                print(f"    ! {issue.section_id}: {issue.issue} (anchor={issue.anchor!r} resolved={issue.resolved!r})")
    finally:
        await close_http_client()

    total_issues = sum(len(r.issues) for r in reports)
    peer_warnings = peer_consistency(reports)

    print("\n=== Summary ===")
    print(f"Tickers: {len(reports)}  Issues: {total_issues}")
    if peer_warnings:
        print("\nPeer consistency warnings:")
        for w in peer_warnings:
            print(f"  - {w}")

    if args.json:
        out = {
            "tickers": [
                {
                    "ticker": r.ticker,
                    "form": r.form,
                    "sections": r.sections,
                    "issues": [i.__dict__ for i in r.issues],
                }
                for r in reports
            ],
            "peer_warnings": peer_warnings,
            "total_issues": total_issues,
        }
        print(json.dumps(out, indent=2))

    return 1 if total_issues else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
