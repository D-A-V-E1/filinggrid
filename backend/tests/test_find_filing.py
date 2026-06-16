"""Tests for SEC filing discovery (domestic + foreign forms)."""

from sec.client import find_filing


def _submissions(rows: list[dict]) -> dict:
    return {
        "filings": {
            "recent": {
                "form": [r["form"] for r in rows],
                "accessionNumber": [r["accession"] for r in rows],
                "filingDate": [r["filing_date"] for r in rows],
                "primaryDocument": [r.get("primary", "primary.htm") for r in rows],
                "reportDate": [r["report_date"] for r in rows],
            }
        }
    }


def test_find_filing_includes_20f():
    subs = _submissions(
        [
            {
                "form": "20-F",
                "accession": "0001193125-24-000001",
                "filing_date": "2024-04-30",
                "report_date": "2023-12-31",
            }
        ]
    )
    filing = find_filing(subs, fiscal_year=2023)
    assert filing is not None
    assert filing["form"] == "20-F"


def test_find_filing_includes_6k_when_no_annual():
    subs = _submissions(
        [
            {
                "form": "6-K",
                "accession": "0001193125-24-000002",
                "filing_date": "2024-08-15",
                "report_date": "2024-06-30",
            }
        ]
    )
    filing = find_filing(subs, fiscal_year=2024)
    assert filing is not None
    assert filing["form"] == "6-K"


def test_find_filing_prefers_20f_over_6k_same_year():
    subs = _submissions(
        [
            {
                "form": "6-K",
                "accession": "0001193125-24-000003",
                "filing_date": "2024-09-01",
                "report_date": "2024-06-30",
            },
            {
                "form": "20-F",
                "accession": "0001193125-24-000004",
                "filing_date": "2024-04-15",
                "report_date": "2024-06-30",
            },
        ]
    )
    filing = find_filing(subs, fiscal_year=2024)
    assert filing is not None
    assert filing["form"] == "20-F"


def test_find_filing_prefers_10k_over_10q_same_year():
    subs = _submissions(
        [
            {
                "form": "10-Q",
                "accession": "0000320193-24-000010",
                "filing_date": "2024-08-02",
                "report_date": "2024-06-30",
            },
            {
                "form": "10-K",
                "accession": "0000320193-24-000001",
                "filing_date": "2024-11-01",
                "report_date": "2024-06-30",
            },
        ]
    )
    filing = find_filing(subs, fiscal_year=2024)
    assert filing is not None
    assert filing["form"] == "10-K"


def test_find_filing_prefers_10k_over_10ka_same_year():
    subs = _submissions(
        [
            {
                "form": "10-K/A",
                "accession": "0000320193-24-000099",
                "filing_date": "2025-01-15",
                "report_date": "2024-06-30",
            },
            {
                "form": "10-K",
                "accession": "0000320193-24-000001",
                "filing_date": "2024-11-01",
                "report_date": "2024-06-30",
            },
        ]
    )
    filing = find_filing(subs, fiscal_year=2024)
    assert filing is not None
    assert filing["form"] == "10-K"


def test_find_filing_prefers_10q_over_10qa_same_year():
    subs = _submissions(
        [
            {
                "form": "10-Q/A",
                "accession": "0000320193-24-000088",
                "filing_date": "2025-02-01",
                "report_date": "2024-09-30",
            },
            {
                "form": "10-Q",
                "accession": "0000320193-24-000055",
                "filing_date": "2024-11-01",
                "report_date": "2024-09-30",
            },
        ]
    )
    filing = find_filing(subs, form_types=["10-Q", "10-Q/A"], fiscal_year=2024)
    assert filing is not None
    assert filing["form"] == "10-Q"
