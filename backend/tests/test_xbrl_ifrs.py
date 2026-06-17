"""Tests for IFRS / 20-F / 6-K XBRL financial extraction."""

from sec.xbrl_client import extract_financial_metrics


def _ifrs_facts() -> dict:
    return {
        "entityName": "TAIWAN SEMICONDUCTOR MANUFACTURING CO LTD",
        "cik": "0001046179",
        "facts": {
            "ifrs-full": {
                "Revenue": {
                    "label": "Revenue",
                    "units": {
                        "USD": [
                            {
                                "start": "2023-01-01",
                                "end": "2023-12-31",
                                "val": 70598800000,
                                "fy": 2023,
                                "fp": "FY",
                                "form": "20-F",
                                "filed": "2024-04-18",
                            }
                        ]
                    },
                },
                "ProfitLoss": {
                    "label": "Profit loss",
                    "units": {
                        "USD": [
                            {
                                "start": "2023-01-01",
                                "end": "2023-12-31",
                                "val": 27793200000,
                                "fy": 2023,
                                "fp": "FY",
                                "form": "20-F",
                                "filed": "2024-04-18",
                            }
                        ]
                    },
                },
                "Assets": {
                    "label": "Assets",
                    "units": {
                        "USD": [
                            {
                                "end": "2023-12-31",
                                "val": 180672700000,
                                "fy": 2023,
                                "fp": "FY",
                                "form": "20-F",
                                "filed": "2024-04-18",
                            }
                        ]
                    },
                },
            }
        },
    }


def test_extract_financial_metrics_ifrs_20f():
    result = extract_financial_metrics(_ifrs_facts(), fiscal_year=2023)
    assert len(result["annual_summary"]) == 1
    row = result["annual_summary"][0]
    assert row["fy"] == 2023
    assert row["revenue"] == 70598800000
    assert row["net_income"] == 27793200000
    assert row["total_assets"] == 180672700000


def test_extract_financial_metrics_6k_snapshot_by_report_date():
    facts = {
        "entityName": "FOREIGN ADR",
        "cik": "0001234567",
        "facts": {
            "ifrs-full": {
                "Revenue": {
                    "units": {
                        "USD": [
                            {
                                "end": "2024-06-30",
                                "val": 5000000000,
                                "form": "6-K",
                                "filed": "2024-08-01",
                            }
                        ]
                    }
                }
            }
        },
    }
    result = extract_financial_metrics(facts, fiscal_year=2024, report_date="2024-06-30")
    assert len(result["annual_summary"]) == 1
    assert result["annual_summary"][0]["revenue"] == 5000000000
