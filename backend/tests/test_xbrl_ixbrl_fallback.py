"""Tests for inline XBRL filing fallback when companyfacts lags."""

from sec.xbrl_client import (
    extract_financial_metrics,
    extract_financial_metrics_from_html_tables,
    extract_financial_metrics_from_ixbrl,
)

_IFRS_20F_IXBRL = """
<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance">
  <xbrli:context id="c-dur">
    <xbrli:period>
      <xbrli:startDate>2025-01-01</xbrli:startDate>
      <xbrli:endDate>2025-12-31</xbrli:endDate>
    </xbrli:period>
  </xbrli:context>
  <xbrli:context id="c-seg">
    <xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension="d">seg</xbrldi:explicitMember></xbrli:segment></xbrli:entity>
    <xbrli:period>
      <xbrli:startDate>2025-01-01</xbrli:startDate>
      <xbrli:endDate>2025-12-31</xbrli:endDate>
    </xbrli:period>
  </xbrli:context>
  <xbrli:context id="c-inst">
    <xbrli:period><xbrli:instant>2025-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>
  <xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
  <xbrli:unit id="twd"><xbrli:measure>iso4217:TWD</xbrli:measure></xbrli:unit>
  <ix:nonFraction unitRef="usd" contextRef="c-dur" scale="6" name="ifrs-full:Revenue">100.5</ix:nonFraction>
  <ix:nonFraction unitRef="usd" contextRef="c-seg" scale="6" name="ifrs-full:Revenue">40.0</ix:nonFraction>
  <ix:nonFraction unitRef="usd" contextRef="c-dur" scale="6" name="ifrs-full:ProfitLoss">25.0</ix:nonFraction>
  <ix:nonFraction unitRef="twd" contextRef="c-inst" scale="6" name="ifrs-full:Assets">500.0</ix:nonFraction>
</html>
"""


_IFRS_6K_IXBRL = """
<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance">
  <xbrli:context id="c-q1-dur">
    <xbrli:period>
      <xbrli:startDate>2026-01-01</xbrli:startDate>
      <xbrli:endDate>2026-03-31</xbrli:endDate>
    </xbrli:period>
  </xbrli:context>
  <xbrli:context id="c-q1-inst">
    <xbrli:period><xbrli:instant>2026-03-31</xbrli:instant></xbrli:period>
  </xbrli:context>
  <xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
  <ix:nonFraction unitRef="usd" contextRef="c-q1-dur" scale="6" name="ifrs-full:Revenue">25.0</ix:nonFraction>
  <ix:nonFraction unitRef="usd" contextRef="c-q1-dur" scale="6" name="ifrs-full:ProfitLoss">9.0</ix:nonFraction>
  <ix:nonFraction unitRef="usd" contextRef="c-q1-inst" scale="6" name="ifrs-full:Assets">200.0</ix:nonFraction>
</html>
"""


def test_extract_financial_metrics_from_ixbrl_interim_6k():
    result = extract_financial_metrics_from_ixbrl(
        _IFRS_6K_IXBRL,
        fiscal_year=2026,
        report_date="2026-03-31",
        form="6-K",
        fp="Q1",
        period_kind="interim",
    )
    assert len(result["annual_summary"]) == 1
    row = result["annual_summary"][0]
    assert row["fy"] == 2026
    assert row["revenue"] == 25_000_000
    assert row["revenue_end"] == "2026-03-31"
    assert result["metrics"]["revenue"]["annual"][0]["fp"] == "Q1"


def test_extract_financial_metrics_from_html_tables_interim_6k():
    html = """
    <html><body>
    NET REVENUE (Notes)</td><td>1,134,103,440</td><td>100</td><td>839,253,664</td>
    <td>100</td><td>382,808,019</td><td>34</td>
    NET INCOME</td><td>572,801,304</td><td>100</td><td>360,732,661</td>
    TOTAL ASSETS</td><td>863,512,267</td><td>285,255,389</td>
    </body></html>
    """
    result = extract_financial_metrics_from_html_tables(
        html,
        fiscal_year=2026,
        report_date="2026-03-31",
        form="6-K",
        fp="Q1",
        period_kind="interim",
    )
    row = result["annual_summary"][0]
    assert row["revenue"] == 382_808_019_000
    assert row["revenue_end"] == "2026-03-31"
    assert result["metrics"]["revenue"]["annual"][0]["fp"] == "Q1"


def test_extract_financial_metrics_interim_prefers_snapshot_over_annual():
    facts = {
        "entityName": "FOREIGN ADR",
        "facts": {
            "ifrs-full": {
                "Revenue": {
                    "units": {
                        "USD": [
                            {
                                "start": "2024-01-01",
                                "end": "2024-12-31",
                                "val": 999,
                                "fy": 2024,
                                "fp": "FY",
                                "form": "20-F",
                            },
                            {
                                "start": "2024-07-01",
                                "end": "2024-09-30",
                                "val": 123,
                                "fy": 2024,
                                "fp": "Q3",
                                "form": "6-K",
                            },
                        ]
                    }
                }
            }
        },
    }
    result = extract_financial_metrics(
        facts,
        fiscal_year=2024,
        report_date="2024-09-30",
    )
    assert result["annual_summary"][0]["revenue"] == 123
    assert result["annual_summary"][0]["revenue_end"] == "2024-09-30"


def test_extract_financial_metrics_interim_does_not_use_all_quarterly_when_end_missing():
    facts = {
        "entityName": "FOREIGN ADR",
        "facts": {
            "ifrs-full": {
                "Revenue": {
                    "units": {
                        "USD": [
                            {
                                "start": "2024-07-01",
                                "end": "2024-09-30",
                                "val": 123,
                                "fy": 2024,
                                "fp": "Q3",
                                "form": "6-K",
                            },
                            {
                                "start": "2024-04-01",
                                "end": "2024-06-30",
                                "val": 999,
                                "fy": 2024,
                                "fp": "Q2",
                                "form": "6-K",
                            },
                        ]
                    }
                }
            }
        },
    }
    result = extract_financial_metrics(
        facts,
        fiscal_year=2024,
        report_date="2024-09-30",
    )
    assert result["annual_summary"][0]["revenue"] == 123


def test_extract_financial_metrics_from_ixbrl_annual_20f():
    result = extract_financial_metrics_from_ixbrl(
        _IFRS_20F_IXBRL,
        fiscal_year=2025,
        report_date="2025-12-31",
        form="20-F",
    )
    assert len(result["annual_summary"]) == 1
    row = result["annual_summary"][0]
    assert row["fy"] == 2025
    assert row["revenue"] == 100_500_000
    assert row["net_income"] == 25_000_000
    assert row["total_assets"] == 500_000_000
    assert result["metrics"]["revenue"]["unit"] == "USD"


def test_companyfacts_empty_then_ixbrl_fallback_shape():
    empty = extract_financial_metrics({"facts": {"ifrs-full": {}}}, fiscal_year=2025)
    assert empty["annual_summary"] == []

    ix = extract_financial_metrics_from_ixbrl(
        _IFRS_20F_IXBRL,
        fiscal_year=2025,
        report_date="2025-12-31",
        form="20-F",
    )
    assert ix["annual_summary"]
