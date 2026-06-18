"""Tests for filing period discovery, labels, and resolution."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from sec.client import find_filing
from sec.filing_periods import (
    filter_free_tier_periods,
    interim_slot_from_option,
    list_comparable_filings,
    merge_filing_periods,
    parse_period_param,
    period_in_free_allowlist,
    resolve_period_filter,
)


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


def test_parse_period_param_annual_and_interim():
    assert parse_period_param("annual-2024") == resolve_period_filter(None, "annual-2024")
    assert parse_period_param("annual-2024-20f") is not None
    interim = parse_period_param("interim-2024-06-29")
    assert interim is not None
    assert interim.kind == "interim"
    assert interim.report_date == "2024-06-29"
    canonical = parse_period_param("interim-2025-Q4-10-Q")
    assert canonical is not None
    assert canonical.fp == "Q4"
    assert canonical.fiscal_year == 2025
    assert canonical.form == "10-Q"
    slot_only = parse_period_param("interim-2025-Q3")
    assert slot_only is not None
    assert slot_only.fp == "Q3"
    assert slot_only.form is None


def test_find_filing_with_interim_period():
    subs = _submissions(
        [
            {
                "form": "10-K",
                "accession": "0000320193-24-000001",
                "filing_date": "2024-11-01",
                "report_date": "2024-09-28",
            },
            {
                "form": "10-Q",
                "accession": "0000320193-24-000010",
                "filing_date": "2024-08-02",
                "report_date": "2024-06-29",
            },
        ]
    )
    filing = find_filing(subs, period="interim-2024-06-29")
    assert filing is not None
    assert filing["form"] == "10-Q"


def test_find_filing_interim_slot_requires_xbrl_fiscal_fp():
    """June-year fiscal Q2 (e.g. MSFT) is only discoverable with XBRL fy/fp tags."""
    subs = _submissions(
        [
            {
                "form": "10-Q",
                "accession": "0000950170-24-008814",
                "filing_date": "2024-01-30",
                "report_date": "2023-12-31",
            },
        ]
    )
    xbrl_q2 = [
        {
            "kind": "interim",
            "fiscal_year": 2024,
            "fp": "Q2",
            "end": "2023-12-31",
            "form": "10-Q",
            "filed": "2024-01-30",
            "accn": "0000950170-24-008814",
        },
    ]
    without_xbrl = find_filing(subs, period="interim-2024-Q2-10-Q")
    assert without_xbrl is None
    with_xbrl = find_filing(subs, period="interim-2024-Q2-10-Q", xbrl_periods=xbrl_q2)
    assert with_xbrl is not None
    assert with_xbrl["report_date"] == "2023-12-31"


def test_find_filing_interim_slot_matches_fp_derived_from_period_end():
    """6-K rows may lack fp; quarter is inferred from period end (e.g. TSM)."""
    subs = _submissions(
        [
            {
                "form": "6-K",
                "accession": "0001193125-24-000010",
                "filing_date": "2024-10-15",
                "report_date": "2024-09-30",
            },
        ]
    )
    xbrl = [
        {
            "kind": "interim",
            "fiscal_year": 2024,
            "fp": None,
            "end": "2024-09-30",
            "form": "6-K",
            "filed": "2024-10-15",
            "accn": "0001193125-24-000010",
        },
    ]
    filing = find_filing(
        subs,
        period="interim-2024-Q3",
        interim_slot=(2024, "Q3", ""),
        xbrl_periods=xbrl,
    )
    assert filing is not None
    assert filing["form"] == "6-K"
    assert filing["report_date"] == "2024-09-30"


def test_find_filing_cross_ticker_via_interim_slot():
    """Legacy date id from one issuer must resolve via fiscal slot on another."""
    aapl = _submissions(
        [
            {
                "form": "10-Q",
                "accession": "0000320193-26-000010",
                "filing_date": "2026-01-30",
                "report_date": "2025-12-27",
            },
        ]
    )
    msft = _submissions(
        [
            {
                "form": "10-Q",
                "accession": "0001193125-26-000010",
                "filing_date": "2026-01-28",
                "report_date": "2025-12-31",
            },
        ]
    )
    xbrl_q4 = [
        {
            "kind": "interim",
            "fiscal_year": 2025,
            "fp": "Q4",
            "end": "2025-12-27",
            "form": "10-Q",
            "filed": "2026-01-30",
            "accn": "0000320193-26-000010",
        },
    ]
    aapl_opts = list_comparable_filings(aapl, xbrl_periods=xbrl_q4)
    slot = interim_slot_from_option(aapl_opts[0])
    assert slot == (2025, "Q4", "10-Q")

    msft_xbrl = [{**xbrl_q4[0], "end": "2025-12-31", "accn": "0001193125-26-000010"}]
    filing = find_filing(
        msft,
        period="interim-2025-12-27",
        interim_slot=slot,
        xbrl_periods=msft_xbrl,
    )
    assert filing is not None
    assert filing["report_date"] == "2025-12-31"


def test_find_filing_with_annual_period_20f():
    subs = _submissions(
        [
            {
                "form": "20-F",
                "accession": "0001193125-24-000001",
                "filing_date": "2024-04-30",
                "report_date": "2023-12-31",
            },
            {
                "form": "6-K",
                "accession": "0001193125-24-000002",
                "filing_date": "2024-08-15",
                "report_date": "2024-06-30",
            },
        ]
    )
    filing = find_filing(subs, period="annual-2023")
    assert filing is not None
    assert filing["form"] == "20-F"


def test_find_filing_latest_prefers_most_recent_filed():
    subs = _submissions(
        [
            {
                "form": "10-K",
                "accession": "0000320193-24-000001",
                "filing_date": "2024-11-01",
                "report_date": "2024-09-28",
            },
            {
                "form": "10-Q",
                "accession": "0000320193-25-000010",
                "filing_date": "2025-08-02",
                "report_date": "2025-06-29",
            },
        ]
    )
    filing = find_filing(subs, fiscal_year=None)
    assert filing is not None
    assert filing["form"] == "10-Q"


def test_list_comparable_filings_labels_include_form():
    subs = _submissions(
        [
            {
                "form": "10-Q",
                "accession": "0000320193-25-000010",
                "filing_date": "2025-08-02",
                "report_date": "2025-06-29",
            },
            {
                "form": "10-K",
                "accession": "0000320193-24-000001",
                "filing_date": "2024-11-01",
                "report_date": "2024-09-28",
            },
        ]
    )
    options = list_comparable_filings(subs)
    assert len(options) >= 2
    assert "10-Q" in options[0]["label"]
    assert options[0]["id"].startswith("interim-")


def test_list_comparable_filings_uses_xbrl_fy_and_fp():
    subs = _submissions(
        [
            {
                "form": "10-Q",
                "accession": "0000320193-25-000010",
                "filing_date": "2025-01-31",
                "report_date": "2024-12-28",
            },
        ]
    )
    xbrl_periods = [
        {
            "kind": "interim",
            "fiscal_year": 2025,
            "fp": "Q1",
            "end": "2024-12-28",
            "form": "10-Q",
            "filed": "2025-01-31",
            "accn": "0000320193-25-000010",
        }
    ]
    options = list_comparable_filings(subs, xbrl_periods=xbrl_periods)
    assert options[0]["fiscal_year"] == 2025
    assert options[0]["fp"] == "Q1"
    assert options[0]["id"] == "interim-2025-Q1-10-Q"
    assert "FY25" in options[0]["label"]
    assert "Q1" in options[0]["label"]


def test_merge_filing_periods_unions_10k_and_20f_by_fiscal_year():
    us = [{"id": "annual-2024", "kind": "annual", "fiscal_year": 2024, "form": "10-K", "label": "FY24 · 10-K"}]
    foreign = [{"id": "annual-2024-20f", "kind": "annual", "fiscal_year": 2024, "form": "20-F", "label": "FY24 · 20-F"}]
    merged_same_form = merge_filing_periods([us, us])
    ids = {o["id"] for o in merged_same_form}
    assert "annual-2024" in ids
    merged_mixed = merge_filing_periods([us, foreign])
    assert len(merged_mixed) == 1
    assert merged_mixed[0]["id"] == "annual-2024"
    assert merged_mixed[0]["label"] == "FY24"


def test_merge_filing_periods_unions_10q_and_6k_by_fiscal_quarter():
    us = [
        {
            "id": "interim-2025-Q3-10-Q",
            "kind": "interim",
            "fiscal_year": 2025,
            "fp": "Q3",
            "form": "10-Q",
            "label": "FY25 · Q3 · 10-Q",
            "filing_date": "2025-08-01",
            "period_end": "2025-06-28",
        }
    ]
    foreign = [
        {
            "id": "interim-2025-Q3-6-K",
            "kind": "interim",
            "fiscal_year": 2025,
            "fp": "Q3",
            "form": "6-K",
            "label": "FY25 · Q3 · 6-K",
            "filing_date": "2025-08-15",
            "period_end": "2025-06-30",
        }
    ]
    merged = merge_filing_periods([us, foreign])
    assert len(merged) == 1
    assert merged[0]["id"] == "interim-2025-Q3"
    assert merged[0]["label"] == "FY25 · Q3"


def test_dedupe_period_options_collapses_duplicate_labels():
    """XBRL + submissions can surface the same fiscal quarter under different period-end ids."""
    options = [
        {
            "id": "interim-2025-Q3-10-Q",
            "kind": "interim",
            "fiscal_year": 2025,
            "fp": "Q3",
            "form": "10-Q",
            "label": "FY25 · Q3 · 10-Q",
            "filing_date": "2025-08-01",
            "period_end": "2025-06-28",
        },
        {
            "id": "interim-2025-Q3-10-Q",
            "kind": "interim",
            "fiscal_year": 2025,
            "fp": "Q3",
            "form": "10-Q",
            "label": "FY25 · Q3 · 10-Q",
            "filing_date": "2024-08-02",
            "period_end": "2024-06-29",
        },
        {
            "id": "interim-2025-Q3-10-Q",
            "kind": "interim",
            "fiscal_year": 2025,
            "fp": "Q3",
            "form": "10-Q",
            "label": "FY25 · Q3 · 10-Q",
            "filing_date": "2024-11-01",
            "period_end": "2024-09-28",
        },
    ]
    from sec.filing_periods import _dedupe_period_options

    deduped = _dedupe_period_options(options)
    labels = [o["label"] for o in deduped]
    assert labels.count("FY25 · Q3 · 10-Q") == 1
    assert deduped[0]["id"] == "interim-2025-Q3-10-Q"


def test_merge_filing_periods_unions_by_fiscal_slot():
    """Same fiscal quarter across issuers becomes one selectable period (canonical id)."""
    aapl = [
        {
            "id": "interim-2025-Q3-10-Q",
            "kind": "interim",
            "fiscal_year": 2025,
            "fp": "Q3",
            "form": "10-Q",
            "label": "FY25 · Q3 · 10-Q",
            "filing_date": "2025-08-01",
            "period_end": "2025-06-28",
            "report_date": "2025-06-28",
        }
    ]
    msft = [
        {
            "id": "interim-2025-Q3-10-Q",
            "kind": "interim",
            "fiscal_year": 2025,
            "fp": "Q3",
            "form": "10-Q",
            "label": "FY25 · Q3 · 10-Q",
            "filing_date": "2025-04-30",
            "period_end": "2025-03-31",
            "report_date": "2025-03-31",
        }
    ]
    merged = merge_filing_periods([aapl, msft])
    ids = {o["id"] for o in merged}
    assert ids == {"interim-2025-Q3"}
    assert merged[0]["label"] == "FY25 · Q3"


def test_merge_filing_periods_intersection_drops_single_ticker_only():
    only_aapl = [{"id": "interim-2023-07-01", "kind": "interim", "fiscal_year": 2023, "form": "10-Q", "label": "x"}]
    shared = [{"id": "annual-2024", "kind": "annual", "fiscal_year": 2024, "form": "10-K", "label": "FY24"}]
    merged = merge_filing_periods([only_aapl + shared, shared])
    ids = {o["id"] for o in merged}
    assert "interim-2023-07-01" not in ids
    assert "annual-2024" in ids


def test_filter_free_tier_periods_latest_plus_completed_year():
    all_periods = [
        {"id": "interim-2026-03-31", "kind": "interim", "fiscal_year": 2026, "label": "FY26 · Q1 · 10-Q"},
        {"id": "annual-2025", "kind": "annual", "fiscal_year": 2025, "label": "FY25 · 10-K"},
        {"id": "interim-2025-12-27", "kind": "interim", "fiscal_year": 2025, "label": "FY25 · Q4 · 10-Q"},
        {"id": "interim-2025-06-28", "kind": "interim", "fiscal_year": 2025, "label": "FY25 · Q2 · 10-Q"},
        {"id": "annual-2024", "kind": "annual", "fiscal_year": 2024, "label": "FY24 · 10-K"},
    ]
    free = filter_free_tier_periods(all_periods)
    ids = {p["id"] for p in free}
    assert "interim-2026-03-31" in ids
    assert "annual-2025" in ids
    assert "interim-2025-12-27" in ids
    assert "annual-2024" not in ids


def test_filter_free_tier_periods_when_latest_is_annual():
    all_periods = [
        {"id": "annual-2025", "kind": "annual", "fiscal_year": 2025, "label": "FY25 · 10-K"},
        {"id": "interim-2025-12-27", "kind": "interim", "fiscal_year": 2025, "label": "FY25 · Q4 · 10-Q"},
        {"id": "annual-2024", "kind": "annual", "fiscal_year": 2024, "label": "FY24 · 10-K"},
    ]
    free = filter_free_tier_periods(all_periods)
    ids = {p["id"] for p in free}
    assert "annual-2025" in ids
    assert "interim-2025-12-27" in ids
    assert "annual-2024" not in ids


def test_period_in_free_allowlist_matches_annual_by_year():
    allowed = [
        {"id": "interim-2026-03-31", "kind": "interim", "fiscal_year": 2026},
        {"id": "annual-2025", "kind": "annual", "fiscal_year": 2025},
    ]
    assert period_in_free_allowlist(2025, None, allowed) is True
    assert period_in_free_allowlist(None, None, allowed) is True
    assert period_in_free_allowlist(2024, None, allowed) is False


def test_list_comparable_filings_unions_submissions_beyond_xbrl():
    """Companyfacts often lacks early years that still exist in EDGAR submissions."""
    subs = _submissions(
        [
            {
                "form": "10-K",
                "accession": "0000320193-00-000001",
                "filing_date": "2000-12-13",
                "report_date": "2000-09-30",
            },
            {
                "form": "10-K",
                "accession": "0000320193-24-000001",
                "filing_date": "2024-11-01",
                "report_date": "2024-09-28",
            },
            {
                "form": "10-Q",
                "accession": "0000320193-25-000010",
                "filing_date": "2025-08-02",
                "report_date": "2025-06-29",
            },
        ]
    )
    xbrl_periods = [
        {
            "kind": "annual",
            "fiscal_year": 2024,
            "fp": "FY",
            "end": "2024-09-28",
            "form": "10-K",
            "filed": "2024-11-01",
            "accn": "0000320193-24-000001",
        },
        {
            "kind": "interim",
            "fiscal_year": 2025,
            "fp": "Q3",
            "end": "2025-06-29",
            "form": "10-Q",
            "filed": "2025-08-02",
            "accn": "0000320193-25-000010",
        },
    ]
    options = list_comparable_filings(subs, xbrl_periods=xbrl_periods)
    ids = {o["id"] for o in options}
    assert "annual-2000" in ids
    assert "annual-2024" in ids
    assert "interim-2025-Q3-10-Q" in ids
    annual_2024 = next(o for o in options if o["id"] == "annual-2024")
    assert annual_2024.get("fp") == "FY"
    assert "FY24" in annual_2024["label"]


def test_filter_free_tier_unchanged_with_deep_history():
    all_periods = [
        {"id": "interim-2026-03-31", "kind": "interim", "fiscal_year": 2026, "label": "FY26 · Q1 · 10-Q"},
        {"id": "annual-2025", "kind": "annual", "fiscal_year": 2025, "label": "FY25 · 10-K"},
        {"id": "annual-2000", "kind": "annual", "fiscal_year": 2000, "label": "FY00 · 10-K"},
    ]
    free = filter_free_tier_periods(all_periods)
    ids = {p["id"] for p in free}
    assert "annual-2000" not in ids
    assert "annual-2025" in ids


@pytest.mark.anyio
async def test_fetch_submissions_merges_archives_when_cache_stale():
    from sec import client as sec_client

    stale_cache = {
        "filings": {
            "recent": {
                "form": ["10-K"],
                "accessionNumber": ["0000320193-24-000001"],
                "filingDate": ["2024-11-01"],
                "reportDate": ["2024-09-28"],
                "primaryDocument": ["aapl-20240928.htm"],
            },
            "files": [{"name": "CIK0000320193-submissions-001.json"}],
        }
    }
    archive_chunk = {
        "form": ["10-K"],
        "accessionNumber": ["0000320193-00-000001"],
        "filingDate": ["2000-12-13"],
        "reportDate": ["2000-09-30"],
        "primaryDocument": ["aapl-20000930.htm"],
    }
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = archive_chunk

    sec_client._submissions_inflight.clear()
    with (
        patch("filing_store.load_submissions", return_value=stale_cache),
        patch("filing_store.save_submissions") as mock_save,
        patch.object(sec_client, "_rate_limited_get", new_callable=AsyncMock, return_value=mock_resp),
    ):
        data = await sec_client.fetch_submissions("0000320193", merge_archives=True)

    assert data["filings"]["_archives_merged"] is True
    recent = data["filings"]["recent"]
    assert "0000320193-00-000001" in recent["accessionNumber"]
    assert "0000320193-24-000001" in recent["accessionNumber"]
    mock_save.assert_called_once()
    sec_client._submissions_inflight.clear()
