"""SEC XBRL companyfacts client for fast financial statement metrics.

Hybrid filing model (recommended architecture)
----------------------------------------------
Full HTML parsing (BeautifulSoup) is accurate for narrative sections — MD&A, risk
factors, footnotes — but slow for large 10-K/10-Q bodies. SEC's JSON companyfacts
API exposes tagged GAAP facts across all filings for a CIK in one request.

This module is the **financials fast path**:

- **XBRL (here):** income statement / balance sheet headline metrics with periods
  (revenue, net income, assets, equity, EPS, etc.) — typically sub-second after cache.
- **HTML parse (section_extractor):** narrative and table-heavy sections unchanged.

A compare view can render financial-statements from ``financials_xbrl`` immediately
while HTML sections load in parallel, or skip HTML for Item 8 when XBRL suffices.

API: https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json
POC scope: common us-gaap tags with fallbacks; not exhaustive GAAP mapping.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from collections.abc import AsyncIterator
from html import unescape
from typing import Any

from sec.client import (
    fetch_ticker_map,
    find_filing,
    get_http_client,
    resolve_ticker,
    _rate_limited_get,
)

COMPANYFACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
_companyfacts_inflight: dict[str, asyncio.Task[dict[str, Any]]] = {}

# Metric key -> candidate us-gaap concept names (first match wins)
METRIC_CONCEPTS: dict[str, list[str]] = {
    "revenue": [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
        "Revenue",
    ],
    "net_income": ["NetIncomeLoss", "ProfitLoss"],
    "total_assets": ["Assets"],
    "total_liabilities": ["Liabilities"],
    "stockholders_equity": [
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
        "Equity",
    ],
    "operating_income": ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"],
    "eps_basic": ["EarningsPerShareBasic", "BasicEarningsLossPerShare"],
    "eps_diluted": ["EarningsPerShareDiluted", "DilutedEarningsLossPerShare"],
    "cash": [
        "CashAndCashEquivalentsAtCarryingValue",
        "CashCashEquivalentsAndShortTermInvestments",
        "CashAndCashEquivalents",
        "Cash",
    ],
}

METRIC_LABELS: dict[str, str] = {
    "revenue": "Revenue",
    "net_income": "Net income",
    "total_assets": "Total assets",
    "total_liabilities": "Total liabilities",
    "stockholders_equity": "Stockholders' equity",
    "operating_income": "Operating income",
    "eps_basic": "EPS (basic)",
    "eps_diluted": "EPS (diluted)",
    "cash": "Cash & equivalents",
}

MAX_ANNUAL_PERIODS = 5
MAX_QUARTERLY_PERIODS = 8

# Ordered GAAP line items for full financial statements (first concept match wins per row).
INCOME_STATEMENT_LINES: list[dict[str, Any]] = [
    {
        "key": "revenue",
        "label": "Revenue",
        "concepts": [
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            "Revenues",
            "SalesRevenueNet",
        ],
    },
    {
        "key": "cost_of_revenue",
        "label": "Cost of revenue",
        "concepts": ["CostOfRevenue", "CostOfGoodsAndServicesSold"],
    },
    {"key": "gross_profit", "label": "Gross profit", "concepts": ["GrossProfit"]},
    {
        "key": "rd_expense",
        "label": "Research & development",
        "concepts": ["ResearchAndDevelopmentExpense"],
    },
    {
        "key": "sga_expense",
        "label": "Selling, general & administrative",
        "concepts": [
            "SellingGeneralAndAdministrativeExpense",
            "GeneralAndAdministrativeExpense",
        ],
    },
    {
        "key": "operating_expenses",
        "label": "Operating expenses",
        "concepts": ["OperatingExpenses", "CostsAndExpenses"],
    },
    {"key": "operating_income", "label": "Operating income", "concepts": ["OperatingIncomeLoss"]},
    {
        "key": "interest_expense",
        "label": "Interest expense",
        "concepts": ["InterestExpense", "InterestExpenseDebt"],
    },
    {
        "key": "interest_income",
        "label": "Interest income",
        "concepts": ["InterestIncomeOperating", "InvestmentIncomeInterest"],
    },
    {
        "key": "other_income",
        "label": "Other income (expense), net",
        "concepts": ["OtherNonoperatingIncomeExpense", "NonoperatingIncomeExpense"],
    },
    {
        "key": "income_before_tax",
        "label": "Income before income taxes",
        "concepts": [
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
        ],
    },
    {"key": "income_tax", "label": "Income tax expense", "concepts": ["IncomeTaxExpenseBenefit"]},
    {"key": "net_income", "label": "Net income", "concepts": ["NetIncomeLoss", "ProfitLoss"]},
    {"key": "eps_basic", "label": "EPS (basic)", "concepts": ["EarningsPerShareBasic"]},
    {"key": "eps_diluted", "label": "EPS (diluted)", "concepts": ["EarningsPerShareDiluted"]},
    {
        "key": "shares_basic",
        "label": "Weighted avg shares (basic)",
        "concepts": ["WeightedAverageNumberOfSharesOutstandingBasic"],
    },
    {
        "key": "shares_diluted",
        "label": "Weighted avg shares (diluted)",
        "concepts": ["WeightedAverageNumberOfDilutedSharesOutstanding"],
    },
    {
        "key": "depreciation",
        "label": "Depreciation & amortization",
        "concepts": ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization"],
    },
]

BALANCE_SHEET_LINES: list[dict[str, Any]] = [
    {
        "key": "cash",
        "label": "Cash & equivalents",
        "concepts": [
            "CashAndCashEquivalentsAtCarryingValue",
            "CashCashEquivalentsAndShortTermInvestments",
        ],
    },
    {
        "key": "short_term_investments",
        "label": "Short-term investments",
        "concepts": ["ShortTermInvestments", "MarketableSecuritiesCurrent"],
    },
    {
        "key": "accounts_receivable",
        "label": "Accounts receivable, net",
        "concepts": ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent"],
    },
    {"key": "inventory", "label": "Inventory, net", "concepts": ["InventoryNet"]},
    {"key": "current_assets", "label": "Total current assets", "concepts": ["AssetsCurrent"]},
    {
        "key": "ppe_net",
        "label": "PP&E, net",
        "concepts": ["PropertyPlantAndEquipmentNet"],
    },
    {"key": "goodwill", "label": "Goodwill", "concepts": ["Goodwill"]},
    {
        "key": "intangibles_net",
        "label": "Intangible assets, net",
        "concepts": ["IntangibleAssetsNetExcludingGoodwill"],
    },
    {"key": "total_assets", "label": "Total assets", "concepts": ["Assets"]},
    {
        "key": "accounts_payable",
        "label": "Accounts payable",
        "concepts": ["AccountsPayableCurrent"],
    },
    {
        "key": "short_term_debt",
        "label": "Short-term debt",
        "concepts": ["ShortTermBorrowings", "LongTermDebtCurrent", "CommercialPaper"],
    },
    {
        "key": "current_liabilities",
        "label": "Total current liabilities",
        "concepts": ["LiabilitiesCurrent"],
    },
    {
        "key": "long_term_debt",
        "label": "Long-term debt",
        "concepts": ["LongTermDebt", "LongTermDebtNoncurrent"],
    },
    {"key": "total_liabilities", "label": "Total liabilities", "concepts": ["Liabilities"]},
    {
        "key": "stockholders_equity",
        "label": "Stockholders' equity",
        "concepts": [
            "StockholdersEquity",
            "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
        ],
    },
    {
        "key": "retained_earnings",
        "label": "Retained earnings",
        "concepts": ["RetainedEarningsAccumulatedDeficit"],
    },
    {
        "key": "common_shares_outstanding",
        "label": "Common shares outstanding",
        "concepts": ["CommonStockSharesOutstanding"],
    },
]

CASH_FLOW_LINES: list[dict[str, Any]] = [
    {"key": "net_income", "label": "Net income", "concepts": ["NetIncomeLoss", "ProfitLoss"]},
    {
        "key": "depreciation",
        "label": "Depreciation & amortization",
        "concepts": ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization"],
    },
    {
        "key": "share_based_comp",
        "label": "Share-based compensation",
        "concepts": ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"],
    },
    {
        "key": "operating_cash_flow",
        "label": "Net cash from operating activities",
        "concepts": [
            "NetCashProvidedByUsedInOperatingActivities",
            "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
        ],
    },
    {
        "key": "capex",
        "label": "Capital expenditures",
        "concepts": [
            "PaymentsToAcquirePropertyPlantAndEquipment",
            "PaymentsToAcquireProductiveAssets",
        ],
    },
    {
        "key": "investing_cash_flow",
        "label": "Net cash from investing activities",
        "concepts": [
            "NetCashProvidedByUsedInInvestingActivities",
            "NetCashProvidedByUsedInInvestingActivitiesContinuingOperations",
        ],
    },
    {
        "key": "financing_cash_flow",
        "label": "Net cash from financing activities",
        "concepts": [
            "NetCashProvidedByUsedInFinancingActivities",
            "NetCashProvidedByUsedInFinancingActivitiesContinuingOperations",
        ],
    },
    {
        "key": "dividends",
        "label": "Dividends paid",
        "concepts": ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
    },
    {
        "key": "stock_repurchases",
        "label": "Stock repurchases",
        "concepts": [
            "PaymentsForRepurchaseOfCommonStock",
            "PaymentsForRepurchaseOfEquity",
        ],
    },
    {
        "key": "net_change_cash",
        "label": "Net change in cash",
        "concepts": [
            "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect",
            "CashAndCashEquivalentsPeriodIncreaseDecrease",
        ],
    },
    {
        "key": "cash_end",
        "label": "Cash at end of period",
        "concepts": [
            "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
            "CashAndCashEquivalentsAtCarryingValue",
        ],
    },
]

STOCKHOLDERS_EQUITY_LINES: list[dict[str, Any]] = [
    {
        "key": "equity_beginning",
        "label": "Stockholders' equity, beginning of period",
        "concepts": [
            "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
            "StockholdersEquity",
        ],
    },
    {
        "key": "common_stock",
        "label": "Common stock",
        "concepts": ["CommonStockValue", "CommonStocksIncludingAdditionalPaidInCapital"],
    },
    {
        "key": "additional_paid_in_capital",
        "label": "Additional paid-in capital",
        "concepts": ["AdditionalPaidInCapital", "AdditionalPaidInCapitalCommonStock"],
    },
    {
        "key": "retained_earnings",
        "label": "Retained earnings",
        "concepts": ["RetainedEarningsAccumulatedDeficit"],
    },
    {
        "key": "aoci",
        "label": "Accumulated other comprehensive income (loss)",
        "concepts": ["AccumulatedOtherComprehensiveIncomeLossNetOfTax"],
    },
    {
        "key": "treasury_stock",
        "label": "Treasury stock",
        "concepts": ["TreasuryStockValue", "TreasuryStockValueAcquiredCostMethod"],
    },
    {"key": "net_income", "label": "Net income", "concepts": ["NetIncomeLoss", "ProfitLoss"]},
    {
        "key": "other_comprehensive_income",
        "label": "Other comprehensive income (loss)",
        "concepts": [
            "OtherComprehensiveIncomeLossNetOfTaxPortionAttributableToParent",
            "OtherComprehensiveIncomeLossNetOfTax",
        ],
    },
    {
        "key": "comprehensive_income",
        "label": "Comprehensive income",
        "concepts": ["ComprehensiveIncomeNetOfTax", "ComprehensiveIncomeNetOfTaxIncludingPortionAttributableToNoncontrollingInterest"],
    },
    {
        "key": "share_based_comp",
        "label": "Share-based compensation",
        "concepts": [
            "AdjustmentsToAdditionalPaidInCapitalSharebasedCompensationRequisiteServicePeriodRecognitionValue",
            "ShareBasedCompensation",
            "StockIssuedDuringPeriodValueShareBasedCompensation",
        ],
    },
    {
        "key": "stock_issued",
        "label": "Stock issued",
        "concepts": [
            "StockIssuedDuringPeriodValueNewIssues",
            "ProceedsFromIssuanceOfCommonStock",
            "StockIssuedDuringPeriodSharesNewIssues",
        ],
    },
    {
        "key": "dividends",
        "label": "Dividends declared",
        "concepts": [
            "DividendsCommonStock",
            "Dividends",
            "PaymentsOfDividends",
            "PaymentsOfDividendsCommonStock",
        ],
    },
    {
        "key": "stock_repurchases",
        "label": "Stock repurchases",
        "concepts": [
            "PaymentsForRepurchaseOfCommonStock",
            "PaymentsForRepurchaseOfEquity",
            "TreasuryStockSharesAcquired",
        ],
    },
    {
        "key": "equity_other",
        "label": "Other equity changes",
        "concepts": [
            "StockholdersEquityOther",
            "AdjustmentsToAdditionalPaidInCapitalOther",
        ],
    },
    {
        "key": "equity_ending",
        "label": "Stockholders' equity, end of period",
        "concepts": [
            "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
            "StockholdersEquity",
        ],
    },
    {
        "key": "common_shares_outstanding",
        "label": "Common shares outstanding",
        "concepts": ["CommonStockSharesOutstanding"],
    },
]

STATEMENT_TABLE_DEFS: tuple[tuple[str, list[dict[str, Any]], str], ...] = (
    ("income_statement", INCOME_STATEMENT_LINES, "Income Statement"),
    ("balance_sheet", BALANCE_SHEET_LINES, "Balance Sheet"),
    ("cash_flow", CASH_FLOW_LINES, "Cash Flow"),
    ("stockholders_equity", STOCKHOLDERS_EQUITY_LINES, "Stockholders' Equity"),
)

ANNUAL_XBRL_FORMS: tuple[str, ...] = ("10-K", "10-K/A", "20-F", "20-F/A")
INTERIM_XBRL_FORMS: tuple[str, ...] = ("10-Q", "10-Q/A", "6-K", "6-K/A")
ALL_XBRL_FORMS: tuple[str, ...] = ANNUAL_XBRL_FORMS + INTERIM_XBRL_FORMS

TAXONOMY_KEYS: tuple[str, ...] = ("us-gaap", "ifrs-full")

# Note section id -> metric definitions (key, label, candidate us-gaap concepts)
NOTE_SECTION_METRICS: dict[str, list[dict[str, Any]]] = {
    "note-summary-policies": [
        {
            "key": "cash",
            "label": "Cash & equivalents",
            "concepts": [
                "CashAndCashEquivalentsAtCarryingValue",
                "CashCashEquivalentsAndShortTermInvestments",
            ],
        },
        {
            "key": "total_assets",
            "label": "Total assets",
            "concepts": ["Assets"],
        },
    ],
    "note-revenue": [
        {
            "key": "revenue",
            "label": "Revenue",
            "concepts": [
                "RevenueFromContractWithCustomerExcludingAssessedTax",
                "Revenues",
                "SalesRevenueNet",
            ],
        },
        {
            "key": "deferred_revenue",
            "label": "Deferred revenue",
            "concepts": [
                "ContractWithCustomerLiability",
                "DeferredRevenueCurrent",
                "DeferredRevenueNoncurrent",
            ],
        },
        {
            "key": "unbilled_receivables",
            "label": "Unbilled receivables",
            "concepts": [
                "ContractWithCustomerAssetNet",
                "ContractWithCustomerAssetNetCurrent",
            ],
        },
    ],
    "note-segments": [
        {
            "key": "segment_assets",
            "label": "Segment assets",
            "concepts": ["SegmentReportingSegmentAssets"],
        },
        {
            "key": "segment_operating_income",
            "label": "Segment operating income",
            "concepts": ["SegmentReportingInformationOperatingIncomeLoss"],
        },
        {
            "key": "revenue",
            "label": "Total revenue",
            "concepts": [
                "RevenueFromContractWithCustomerExcludingAssessedTax",
                "Revenues",
            ],
        },
    ],
    "note-cash": [
        {
            "key": "cash",
            "label": "Cash & equivalents",
            "concepts": [
                "CashAndCashEquivalentsAtCarryingValue",
                "CashCashEquivalentsAndShortTermInvestments",
            ],
        },
        {
            "key": "restricted_cash",
            "label": "Restricted cash",
            "concepts": [
                "RestrictedCashAndCashEquivalentsAtCarryingValue",
                "RestrictedCash",
                "RestrictedCashAndCashEquivalentsNoncurrent",
            ],
        },
    ],
    "note-investments": [
        {
            "key": "marketable_securities",
            "label": "Marketable securities",
            "concepts": [
                "MarketableSecuritiesCurrent",
                "AvailableForSaleSecuritiesDebtSecurities",
                "ShortTermInvestments",
            ],
        },
        {
            "key": "afs_fair_value",
            "label": "AFS securities (fair value)",
            "concepts": ["AvailableForSaleSecuritiesFairValueDisclosure"],
        },
        {
            "key": "equity_investments",
            "label": "Equity investments",
            "concepts": [
                "EquitySecuritiesFvNi",
                "EquitySecuritiesWithoutReadilyDeterminableFairValueAmount",
            ],
        },
    ],
    "note-fair-value": [
        {
            "key": "afs_fair_value",
            "label": "AFS securities (fair value)",
            "concepts": ["AvailableForSaleSecuritiesFairValueDisclosure"],
        },
        {
            "key": "derivative_assets",
            "label": "Derivative assets",
            "concepts": ["DerivativeAssets", "DerivativeFairValueOfDerivativeAsset"],
        },
        {
            "key": "derivative_liabilities",
            "label": "Derivative liabilities",
            "concepts": ["DerivativeLiabilities", "DerivativeFairValueOfDerivativeLiability"],
        },
    ],
    "note-receivables": [
        {
            "key": "accounts_receivable",
            "label": "Accounts receivable, net",
            "concepts": [
                "AccountsReceivableNetCurrent",
                "ReceivablesNetCurrent",
            ],
        },
        {
            "key": "allowance_doubtful",
            "label": "Allowance for doubtful accounts",
            "concepts": ["AllowanceForDoubtfulAccountsReceivableCurrent"],
        },
    ],
    "note-inventory": [
        {
            "key": "inventory",
            "label": "Inventory, net",
            "concepts": ["InventoryNet", "InventoryFinishedGoods", "InventoryGross"],
        },
    ],
    "note-ppe": [
        {
            "key": "ppe_net",
            "label": "PP&E, net",
            "concepts": ["PropertyPlantAndEquipmentNet"],
        },
        {
            "key": "ppe_gross",
            "label": "PP&E, gross",
            "concepts": ["PropertyPlantAndEquipmentGross"],
        },
        {
            "key": "accumulated_depreciation",
            "label": "Accumulated depreciation",
            "concepts": [
                "AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment",
            ],
        },
    ],
    "note-goodwill": [
        {
            "key": "goodwill",
            "label": "Goodwill",
            "concepts": ["Goodwill"],
        },
        {
            "key": "intangibles_net",
            "label": "Intangible assets, net",
            "concepts": [
                "IntangibleAssetsNetExcludingGoodwill",
                "FiniteLivedIntangibleAssetsNet",
            ],
        },
        {
            "key": "goodwill_impairment",
            "label": "Goodwill impairment",
            "concepts": ["GoodwillImpairmentLoss"],
        },
    ],
    "note-leases": [
        {
            "key": "operating_lease_liability",
            "label": "Operating lease liability",
            "concepts": [
                "OperatingLeaseLiability",
                "OperatingLeaseLiabilityNoncurrent",
            ],
        },
        {
            "key": "finance_lease_liability",
            "label": "Finance lease liability",
            "concepts": ["FinanceLeaseLiability"],
        },
        {
            "key": "operating_rou_asset",
            "label": "Operating lease ROU asset",
            "concepts": ["OperatingLeaseRightOfUseAsset"],
        },
        {
            "key": "finance_rou_asset",
            "label": "Finance lease ROU asset",
            "concepts": ["FinanceLeaseRightOfUseAsset"],
        },
    ],
    "note-debt": [
        {
            "key": "long_term_debt",
            "label": "Long-term debt",
            "concepts": [
                "LongTermDebt",
                "LongTermDebtNoncurrent",
                "DebtInstrumentCarryingAmount",
            ],
        },
        {
            "key": "short_term_debt",
            "label": "Short-term debt",
            "concepts": [
                "ShortTermBorrowings",
                "LongTermDebtCurrent",
                "CommercialPaper",
            ],
        },
        {
            "key": "total_debt",
            "label": "Total debt",
            "concepts": ["DebtAndCapitalLeaseObligations", "DebtCurrent"],
        },
    ],
    "note-derivatives": [
        {
            "key": "derivative_assets",
            "label": "Derivative assets",
            "concepts": ["DerivativeAssets", "DerivativeFairValueOfDerivativeAsset"],
        },
        {
            "key": "derivative_liabilities",
            "label": "Derivative liabilities",
            "concepts": ["DerivativeLiabilities", "DerivativeFairValueOfDerivativeLiability"],
        },
    ],
    "note-pension": [
        {
            "key": "benefit_obligation",
            "label": "Benefit obligation",
            "concepts": [
                "DefinedBenefitPlanBenefitObligation",
                "PensionPlansDefinedBenefitPlanObligationBenefitObligation",
            ],
        },
        {
            "key": "plan_assets",
            "label": "Plan assets (fair value)",
            "concepts": [
                "DefinedBenefitPlanFairValueOfPlanAssets",
                "PensionPlansDefinedBenefitPlanFairValueOfPlanAssets",
            ],
        },
    ],
    "note-income-tax": [
        {
            "key": "income_tax_expense",
            "label": "Income tax expense",
            "concepts": ["IncomeTaxExpenseBenefit"],
        },
        {
            "key": "deferred_tax_assets",
            "label": "Deferred tax assets, net",
            "concepts": ["DeferredIncomeTaxAssetsNet"],
        },
        {
            "key": "deferred_tax_liabilities",
            "label": "Deferred tax liabilities, net",
            "concepts": ["DeferredIncomeTaxLiabilitiesNet"],
        },
        {
            "key": "effective_tax_rate",
            "label": "Effective tax rate",
            "concepts": ["EffectiveIncomeTaxRateContinuingOperations"],
        },
    ],
    "note-stock-comp": [
        {
            "key": "share_based_comp",
            "label": "Share-based compensation",
            "concepts": [
                "ShareBasedCompensation",
                "AllocatedShareBasedCompensationExpense",
            ],
        },
        {
            "key": "unrecognized_comp",
            "label": "Unrecognized compensation cost",
            "concepts": [
                "EmployeeServiceShareBasedCompensationNonvestedAwardsTotalCompensationCostNotYetRecognized",
            ],
        },
    ],
    "note-equity": [
        {
            "key": "stockholders_equity",
            "label": "Stockholders' equity",
            "concepts": [
                "StockholdersEquity",
                "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
            ],
        },
        {
            "key": "retained_earnings",
            "label": "Retained earnings",
            "concepts": ["RetainedEarningsAccumulatedDeficit"],
        },
        {
            "key": "treasury_stock",
            "label": "Treasury stock",
            "concepts": ["TreasuryStockValue", "TreasuryStockValueAcquiredCostMethod"],
        },
        {
            "key": "common_shares_outstanding",
            "label": "Common shares outstanding",
            "concepts": ["CommonStockSharesOutstanding"],
        },
    ],
    "note-eps": [
        {
            "key": "eps_basic",
            "label": "EPS (basic)",
            "concepts": ["EarningsPerShareBasic"],
        },
        {
            "key": "eps_diluted",
            "label": "EPS (diluted)",
            "concepts": ["EarningsPerShareDiluted"],
        },
        {
            "key": "shares_basic",
            "label": "Weighted avg shares (basic)",
            "concepts": ["WeightedAverageNumberOfSharesOutstandingBasic"],
        },
        {
            "key": "shares_diluted",
            "label": "Weighted avg shares (diluted)",
            "concepts": ["WeightedAverageNumberOfDilutedSharesOutstanding"],
        },
    ],
    "note-aoci": [
        {
            "key": "aoci",
            "label": "AOCI, net of tax",
            "concepts": ["AccumulatedOtherComprehensiveIncomeLossNetOfTax"],
        },
        {
            "key": "aoci_foreign_currency",
            "label": "Foreign currency translation",
            "concepts": [
                "AccumulatedOtherComprehensiveIncomeLossForeignCurrencyTranslationAdjustmentNetOfTax",
            ],
        },
        {
            "key": "aoci_unrealized_gains",
            "label": "Unrealized gains/losses on securities",
            "concepts": [
                "AccumulatedOtherComprehensiveIncomeLossAvailableForSaleSecuritiesAdjustmentNetOfTax",
            ],
        },
    ],
    "note-restructuring": [
        {
            "key": "restructuring_charges",
            "label": "Restructuring charges",
            "concepts": ["RestructuringCharges", "RestructuringCosts"],
        },
        {
            "key": "restructuring_reserve",
            "label": "Restructuring reserve",
            "concepts": ["RestructuringReserve", "RestructuringReserveCurrent"],
        },
    ],
    "note-impairment": [
        {
            "key": "asset_impairment",
            "label": "Asset impairment charges",
            "concepts": ["AssetImpairmentCharges"],
        },
        {
            "key": "goodwill_impairment",
            "label": "Goodwill impairment",
            "concepts": ["GoodwillImpairmentLoss"],
        },
        {
            "key": "intangible_impairment",
            "label": "Intangible impairment",
            "concepts": [
                "ImpairmentOfIntangibleAssetsExcludingGoodwill",
                "ImpairmentOfIntangibleAssetsIndefinitelivedExcludingGoodwill",
            ],
        },
    ],
    "note-acquisitions": [
        {
            "key": "acquisition_payments",
            "label": "Acquisition payments (net of cash)",
            "concepts": ["PaymentsToAcquireBusinessesNetOfCashAcquired"],
        },
        {
            "key": "goodwill_from_acquisition",
            "label": "Goodwill from acquisitions",
            "concepts": ["BusinessAcquisitionPurchasePriceAllocationGoodwillAmount"],
        },
        {
            "key": "intangibles_from_acquisition",
            "label": "Acquired intangibles",
            "concepts": [
                "BusinessAcquisitionPurchasePriceAllocationAmortizableIntangibleAssets",
            ],
        },
    ],
    "note-software": [
        {
            "key": "capitalized_software",
            "label": "Capitalized software, net",
            "concepts": [
                "CapitalizedComputerSoftwareNet",
                "CapitalizedComputerSoftwareGross",
            ],
        },
        {
            "key": "software_amortization",
            "label": "Software amortization",
            "concepts": ["CapitalizedComputerSoftwareAmortization"],
        },
    ],
    "note-related-party": [
        {
            "key": "related_party_expenses",
            "label": "Related party expenses",
            "concepts": [
                "RelatedPartyTransactionExpensesFromTransactionsWithRelatedParty",
            ],
        },
        {
            "key": "related_party_revenue",
            "label": "Related party revenue",
            "concepts": [
                "RelatedPartyTransactionRevenuesFromTransactionsWithRelatedParty",
            ],
        },
    ],
    "note-contingencies": [
        {
            "key": "loss_contingency",
            "label": "Loss contingency accrual",
            "concepts": ["LossContingencyAccrualCarryingValueCurrent"],
        },
        {
            "key": "purchase_obligations",
            "label": "Purchase obligations",
            "concepts": ["PurchaseObligation"],
        },
    ],
}

# Note section id -> narrative text block definitions (key, label, candidate us-gaap concepts)
NOTE_SECTION_TEXT_BLOCKS: dict[str, list[dict[str, Any]]] = {
    "note-summary-policies": [
        {
            "key": "summary_policies",
            "label": "Summary of significant accounting policies",
            "concepts": [
                "BasisOfPresentationAndSignificantAccountingPoliciesTextBlock",
                "SignificantAccountingPoliciesTextBlock",
            ],
        },
        {
            "key": "basis_of_presentation",
            "label": "Basis of presentation",
            "concepts": [
                "BasisOfAccountingPolicyPolicyTextBlock",
                "BasisOfPresentationTextBlock",
            ],
        },
    ],
    "note-revenue": [
        {
            "key": "revenue_recognition",
            "label": "Revenue recognition",
            "concepts": [
                "RevenueFromContractWithCustomerTextBlock",
                "RevenueRecognitionPolicyTextBlock",
                "RevenueRecognitionPolicyPolicyTextBlock",
            ],
        },
    ],
    "note-segments": [
        {
            "key": "segment_reporting",
            "label": "Segment information",
            "concepts": [
                "SegmentReportingDisclosureTextBlock",
                "ScheduleOfSegmentReportingInformationBySegmentTextBlock",
            ],
        },
    ],
    "note-cash": [
        {
            "key": "cash_disclosure",
            "label": "Cash and cash equivalents",
            "concepts": [
                "CashAndCashEquivalentsTextBlock",
                "ScheduleOfCashCashEquivalentsAndShortTermInvestmentsTableTextBlock",
            ],
        },
    ],
    "note-investments": [
        {
            "key": "investments",
            "label": "Investments and marketable securities",
            "concepts": [
                "FinancialInstrumentsDisclosureTextBlock",
                "InvestmentsInDebtAndEquitySecuritiesTextBlock",
                "AvailableForSaleSecuritiesTextBlock",
            ],
        },
    ],
    "note-fair-value": [
        {
            "key": "fair_value",
            "label": "Fair value measurements",
            "concepts": [
                "FairValueDisclosuresTextBlock",
                "FairValueMeasurementPolicyPolicyTextBlock",
                "FairValueAssetsAndLiabilitiesMeasuredOnRecurringAndNonrecurringBasisTextBlock",
            ],
        },
    ],
    "note-receivables": [
        {
            "key": "receivables",
            "label": "Accounts receivable",
            "concepts": [
                "AccountsReceivableAndOtherReceivablesTextBlock",
                "AccountsReceivableDisclosureTextBlock",
            ],
        },
    ],
    "note-inventory": [
        {
            "key": "inventory",
            "label": "Inventory",
            "concepts": ["InventoryDisclosureTextBlock", "InventoryPolicyTextBlock"],
        },
    ],
    "note-ppe": [
        {
            "key": "ppe",
            "label": "Property, plant and equipment",
            "concepts": ["PropertyPlantAndEquipmentTextBlock"],
        },
    ],
    "note-goodwill": [
        {
            "key": "goodwill_intangibles",
            "label": "Goodwill and intangible assets",
            "concepts": [
                "GoodwillAndIntangibleAssetsDisclosureTextBlock",
                "GoodwillAndIntangibleAssetsPolicyTextBlock",
            ],
        },
    ],
    "note-leases": [
        {
            "key": "leases",
            "label": "Leases",
            "concepts": [
                "LeaseDescriptionTextBlock",
                "LesseeOperatingLeasesTextBlock",
                "LesseeFinanceLeasesTextBlock",
            ],
        },
    ],
    "note-debt": [
        {
            "key": "debt",
            "label": "Debt",
            "concepts": [
                "DebtDisclosureTextBlock",
                "LongTermDebtTextBlock",
                "ScheduleOfDebtTableTextBlock",
            ],
        },
    ],
    "note-derivatives": [
        {
            "key": "derivatives",
            "label": "Derivatives and hedging",
            "concepts": [
                "DerivativeInstrumentsAndHedgingActivitiesDisclosureTextBlock",
                "ScheduleOfNotionalAmountsOfOutstandingDerivativePositionsTableTextBlock",
            ],
        },
    ],
    "note-pension": [
        {
            "key": "pension",
            "label": "Pension and postretirement benefits",
            "concepts": [
                "DefinedBenefitPlanDisclosuresTextBlock",
                "PensionAndOtherPostretirementBenefitsDisclosureTextBlock",
            ],
        },
    ],
    "note-income-tax": [
        {
            "key": "income_tax",
            "label": "Income taxes",
            "concepts": [
                "IncomeTaxDisclosureTextBlock",
                "ScheduleOfIncomeTaxExpenseBenefitTextBlock",
                "IncomeTaxPolicyTextBlock",
            ],
        },
    ],
    "note-stock-comp": [
        {
            "key": "stock_comp",
            "label": "Share-based compensation",
            "concepts": [
                "DisclosureOfCompensationRelatedCostsShareBasedPaymentsTextBlock",
                "ShareBasedCompensationTextBlock",
                "ScheduleOfCompensationCostForShareBasedPaymentArrangementsAllocationOfShareBasedCompensationCostsByPlanTableTextBlock",
            ],
        },
    ],
    "note-equity": [
        {
            "key": "equity",
            "label": "Stockholders' equity",
            "concepts": ["StockholdersEquityNoteDisclosureTextBlock"],
        },
    ],
    "note-eps": [
        {
            "key": "eps",
            "label": "Earnings per share",
            "concepts": [
                "EarningsPerShareTextBlock",
                "ScheduleOfEarningsPerShareBasicAndDilutedTableTextBlock",
            ],
        },
    ],
    "note-aoci": [
        {
            "key": "aoci",
            "label": "Accumulated other comprehensive income",
            "concepts": [
                "AccumulatedOtherComprehensiveIncomeLossTextBlock",
                "ScheduleOfAccumulatedOtherComprehensiveIncomeLossTableTextBlock",
            ],
        },
    ],
    "note-restructuring": [
        {
            "key": "restructuring",
            "label": "Restructuring",
            "concepts": [
                "RestructuringAndRelatedActivitiesDisclosureTextBlock",
                "RestructuringCostsTextBlock",
            ],
        },
    ],
    "note-impairment": [
        {
            "key": "impairment",
            "label": "Impairment",
            "concepts": [
                "ImpairmentOfLongLivedAssetsAndGoodwillTextBlock",
                "AssetImpairmentChargesTextBlock",
            ],
        },
    ],
    "note-acquisitions": [
        {
            "key": "acquisitions",
            "label": "Business combinations",
            "concepts": [
                "BusinessCombinationDisclosureTextBlock",
                "BusinessCombinationsPolicyTextBlock",
            ],
        },
    ],
    "note-software": [
        {
            "key": "software",
            "label": "Capitalized software",
            "concepts": [
                "CapitalizedSoftwareDisclosureTextBlock",
                "CapitalizedComputerSoftwarePolicyTextBlock",
            ],
        },
    ],
    "note-related-party": [
        {
            "key": "related_party",
            "label": "Related party transactions",
            "concepts": ["RelatedPartyTransactionsDisclosureTextBlock"],
        },
    ],
    "note-contingencies": [
        {
            "key": "contingencies",
            "label": "Commitments and contingencies",
            "concepts": [
                "CommitmentsAndContingenciesDisclosureTextBlock",
                "LossContingenciesDisclosureTextBlock",
            ],
        },
    ],
    "note-subsequent-events": [
        {
            "key": "subsequent_events",
            "label": "Subsequent events",
            "concepts": ["SubsequentEventsTextBlock"],
        },
    ],
    "note-recent-standards": [
        {
            "key": "recent_standards",
            "label": "Recently adopted accounting standards",
            "concepts": [
                "NewAccountingPronouncementsAndChangesInAccountingPrinciplesTextBlock",
                "NewAccountingPronouncementsPolicyPolicyTextBlock",
            ],
        },
    ],
}


def _strip_xbrl_html(html_fragment: str) -> str:
    """Convert inline XBRL HTML fragments to plain prose for display."""
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html_fragment, flags=re.I | re.S)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</p>", "\n\n", text, flags=re.I)
    text = re.sub(r"</div>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text)
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _extract_ix_text_block(html: str, concept: str) -> str | None:
    """Extract narrative text for a us-gaap TextBlock concept from inline XBRL HTML."""
    pattern = re.compile(
        rf'<ix:nonNumeric\b[^>]*\bname="[^"]*:{re.escape(concept)}"[^>]*>',
        re.I,
    )
    match = pattern.search(html)
    if not match:
        return None

    tag_html = match.group(0)
    parts: list[str] = []
    close = re.search(r"</ix:nonNumeric>", html[match.end() :], re.I)
    if close:
        inner = html[match.end() : match.end() + close.start()]
        heading = _strip_xbrl_html(inner)
        if heading:
            parts.append(heading)

    cont_id_m = re.search(r'\bcontinuedat="([^"]+)"', tag_html, re.I)
    cont_id = cont_id_m.group(1) if cont_id_m else None
    visited: set[str] = set()
    while cont_id and cont_id not in visited:
        visited.add(cont_id)
        cont_pat = re.compile(
            rf'<ix:continuation\b[^>]*\bid="{re.escape(cont_id)}"[^>]*>(.*?)</ix:continuation>',
            re.I | re.S,
        )
        cont_match = cont_pat.search(html)
        if not cont_match:
            break
        body = _strip_xbrl_html(cont_match.group(1))
        if body:
            parts.append(body)
        cont_tag = cont_match.group(0)
        next_m = re.search(r'\bcontinuedat="([^"]+)"', cont_tag, re.I)
        cont_id = next_m.group(1) if next_m else None

    return "\n\n".join(parts) if parts else None


def _extract_disclosures_from_html(
    html: str,
    block_defs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return matched disclosure blocks for a note section from iXBRL HTML."""
    disclosures: list[dict[str, Any]] = []
    seen_concepts: set[str] = set()

    for defn in block_defs:
        for concept in defn["concepts"]:
            if concept in seen_concepts:
                continue
            text = _extract_ix_text_block(html, concept)
            if not text:
                continue
            seen_concepts.add(concept)
            disclosures.append(
                {
                    "key": defn["key"],
                    "label": defn.get("label", concept),
                    "concept": concept,
                    "text": text,
                }
            )
            break

    return disclosures


def _load_cached_filing_html(cik: str, fiscal_year: int | None) -> bytes | None:
    """Load filing HTML from disk cache only (no SEC network fetch)."""
    from filing_store import load_filing_html, load_submissions

    submissions = load_submissions(cik)
    if not submissions:
        return None
    filing = find_filing(submissions, fiscal_year=fiscal_year)
    if not filing:
        return None
    return load_filing_html(cik, filing["accession_no_dash"])


async def fetch_company_facts(cik: str) -> tuple[dict[str, Any], bool]:
    """Fetch raw companyfacts JSON; returns (data, from_cache)."""
    from filing_store import load_company_facts, save_company_facts

    cached = load_company_facts(cik)
    if cached:
        return cached, True

    in_flight = _companyfacts_inflight.get(cik)
    if in_flight is not None:
        return await in_flight, False

    async def _load() -> dict[str, Any]:
        cik_padded = str(int(cik)).zfill(10)
        url = COMPANYFACTS_URL.format(cik=cik_padded)
        client = await get_http_client()
        resp = await _rate_limited_get(client, url, data_api=True)
        resp.raise_for_status()
        data = resp.json()
        save_company_facts(cik, data)
        return data

    task = asyncio.create_task(_load())
    _companyfacts_inflight[cik] = task
    try:
        data = await task
        return data, False
    finally:
        _companyfacts_inflight.pop(cik, None)


def _taxonomy_maps(facts: dict[str, Any]) -> list[dict[str, Any]]:
    """Ordered taxonomy concept maps: US GAAP first, then IFRS for foreign 20-F filers."""
    raw = facts.get("facts") or {}
    return [raw[key] for key in TAXONOMY_KEYS if raw.get(key)]


def _pick_concept_from_facts(facts: dict[str, Any], candidates: list[str]) -> dict[str, Any] | None:
    for taxonomy in _taxonomy_maps(facts):
        concept = _pick_concept(taxonomy, candidates)
        if concept:
            return concept
    return None


def _pick_concept(gaap: dict[str, Any], candidates: list[str]) -> dict[str, Any] | None:
    """Pick the candidate concept with the most recent annual observation."""
    best: dict[str, Any] | None = None
    best_end = ""
    for name in candidates:
        concept = gaap.get(name)
        if not concept:
            continue
        _, entries = _unit_entries(concept)
        annual = _filter_annual(entries, None)
        candidates_obs = annual
        if not candidates_obs:
            candidates_obs = _dedupe_observations(
                _sort_observations(
                    [e for e in entries if (e.get("form") or "") in ALL_XBRL_FORMS and e.get("end")]
                )
            )
        if not candidates_obs:
            continue
        latest_end = candidates_obs[0].get("end") or ""
        if latest_end > best_end:
            best_end = latest_end
            best = concept
    return best


def _unit_entries(concept: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    units = concept.get("units") or {}
    if not units:
        return "", []
    # Prefer USD for monetary; pure for EPS
    for preferred in ("USD", "USD/shares", "shares"):
        if preferred in units:
            return preferred, list(units[preferred])
    key = next(iter(units))
    return key, list(units[key])


def _dedupe_observations(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, ...]] = set()
    out: list[dict[str, Any]] = []
    for e in entries:
        key = (e.get("fy"), e.get("fp"), e.get("end"), e.get("form"), e.get("val"))
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out


def _sort_observations(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        entries,
        key=lambda e: (e.get("end") or "", e.get("filed") or ""),
        reverse=True,
    )


PERIOD_DISCOVERY_CONCEPTS: tuple[str, ...] = (
    "Assets",
    "Revenues",
    "Revenue",
    "SalesRevenueNet",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "NetIncomeLoss",
    "ProfitLoss",
)


def list_reporting_periods(companyfacts: dict[str, Any]) -> list[dict[str, Any]]:
    """Distinct reporting periods from XBRL companyfacts (fy, fp, form, end)."""
    periods: dict[tuple[Any, ...], dict[str, Any]] = {}

    for taxonomy in _taxonomy_maps(companyfacts):
        for name in PERIOD_DISCOVERY_CONCEPTS:
            concept = taxonomy.get(name)
            if not concept:
                continue
            _, entries = _unit_entries(concept)
            for obs in entries:
                form = obs.get("form") or ""
                if form not in ALL_XBRL_FORMS:
                    continue
                fp = obs.get("fp")
                fy = obs.get("fy")
                end = obs.get("end")
                if not end:
                    continue
                if form in ("6-K", "6-K/A") and (fy is None or fp is None):
                    fy_val = int(end[:4]) if end else None
                    if fy_val is None:
                        continue
                    key = ("interim", fy_val, end, form.replace("/A", ""))
                    kind = "interim"
                    fp_out = fp
                    fy_out = fy_val
                elif fy is None or not fp:
                    continue
                else:
                    if fp == "FY":
                        kind = "annual"
                    elif fp in ("Q1", "Q2", "Q3", "Q4"):
                        kind = "interim"
                    else:
                        continue
                    key = (int(fy), fp, end, form.replace("/A", ""))
                    fp_out = fp
                    fy_out = int(fy)
                filed = obs.get("filed") or ""
                existing = periods.get(key)
                if existing is None or filed > (existing.get("filed") or ""):
                    periods[key] = {
                        "kind": kind,
                        "fiscal_year": fy_out,
                        "fp": fp_out,
                        "end": end,
                        "form": form,
                        "filed": filed,
                        "accn": obs.get("accn"),
                    }

    result = list(periods.values())
    result.sort(key=lambda p: (p.get("end") or "", p.get("filed") or ""), reverse=True)
    return result


def _filter_annual(entries: list[dict[str, Any]], fiscal_year: int | None) -> list[dict[str, Any]]:
    annual = [
        e
        for e in entries
        if e.get("fp") == "FY" and (e.get("form") or "") in ANNUAL_XBRL_FORMS
    ]
    annual = _dedupe_observations(_sort_observations(annual))
    if fiscal_year is not None:
        annual = [e for e in annual if e.get("fy") == fiscal_year]
    return annual[:MAX_ANNUAL_PERIODS]


def _filter_quarterly(entries: list[dict[str, Any]], fiscal_year: int | None) -> list[dict[str, Any]]:
    quarterly = [
        e
        for e in entries
        if e.get("fp") in ("Q1", "Q2", "Q3", "Q4")
        and (e.get("form") or "") in INTERIM_XBRL_FORMS
    ]
    quarterly = _dedupe_observations(_sort_observations(quarterly))
    if fiscal_year is not None:
        quarterly = [e for e in quarterly if e.get("fy") == fiscal_year]
    return quarterly[:MAX_QUARTERLY_PERIODS]


def _filter_snapshot(
    entries: list[dict[str, Any]],
    report_date: str | None,
) -> list[dict[str, Any]]:
    """Match interim 6-K / 10-Q facts by period-end date when fy/fp tags are missing."""
    if not report_date:
        return []
    snap = [
        e
        for e in entries
        if e.get("end") == report_date and (e.get("form") or "") in ALL_XBRL_FORMS
    ]
    return _dedupe_observations(_sort_observations(snap))[:1]


def _obs_to_period(obs: dict[str, Any]) -> dict[str, Any]:
    return {
        "fy": obs.get("fy"),
        "fp": obs.get("fp"),
        "end": obs.get("end"),
        "value": obs.get("val"),
        "form": obs.get("form"),
        "filed": obs.get("filed"),
        "accn": obs.get("accn"),
    }


def _build_annual_summary(metrics: dict[str, Any]) -> list[dict[str, Any]]:
    years: set[int] = set()
    for m in metrics.values():
        for p in m.get("annual", []):
            fy = p.get("fy")
            if fy is not None:
                years.add(int(fy))
            elif p.get("end"):
                years.add(int(str(p["end"])[:4]))
    annual_summary: list[dict[str, Any]] = []
    for fy in sorted(years, reverse=True)[:MAX_ANNUAL_PERIODS]:
        row: dict[str, Any] = {"fy": fy}
        for key, m in metrics.items():
            match = next(
                (
                    p
                    for p in m.get("annual", [])
                    if p.get("fy") == fy
                    or (p.get("fy") is None and str(p.get("end") or "")[:4] == str(fy))
                ),
                None,
            )
            if match:
                row[key] = match["value"]
                row[f"{key}_end"] = match.get("end")
        annual_summary.append(row)
    return annual_summary


def _extract_metrics_from_defs(
    facts: dict[str, Any],
    metric_defs: list[dict[str, Any]],
    *,
    fiscal_year: int | None = None,
    report_date: str | None = None,
) -> dict[str, Any]:
    metrics: dict[str, Any] = {}
    for defn in metric_defs:
        key = defn["key"]
        concepts = defn["concepts"]
        concept = _pick_concept_from_facts(facts, concepts)
        if not concept:
            continue
        unit, entries = _unit_entries(concept)
        annual = _filter_annual(entries, fiscal_year)
        quarterly = _filter_quarterly(entries, fiscal_year)
        snapshot = _filter_snapshot(entries, report_date)
        if report_date and snapshot and not annual and not quarterly:
            annual = snapshot
        if not annual and not quarterly:
            continue
        metrics[key] = {
            "label": defn.get("label", concept.get("label", key)),
            "concept": concept.get("label"),
            "unit": unit,
            "annual": [_obs_to_period(o) for o in annual],
            "quarterly": [_obs_to_period(o) for o in quarterly],
        }
    return metrics


def _metric_defs_from_concepts(
    concepts_map: dict[str, list[str]],
    labels_map: dict[str, str],
) -> list[dict[str, Any]]:
    return [
        {"key": key, "label": labels_map.get(key, key), "concepts": concepts}
        for key, concepts in concepts_map.items()
    ]


def _note_section_label(section_id: str) -> str:
    from sec.section_extractor import SECTION_DEFINITIONS

    for section in SECTION_DEFINITIONS:
        if section["id"] == section_id:
            return str(section["label"])
    return section_id.replace("-", " ").title()


def _pick_observation_for_period(
    entries: list[dict[str, Any]],
    period_filter: Any | None,
) -> dict[str, Any] | None:
    """Pick the best observation for a statement line given annual or interim period filter."""
    if not entries:
        return None

    entries = _dedupe_observations(_sort_observations(entries))

    if period_filter is None:
        annual = _filter_annual(entries, None)
        if annual:
            return annual[0]
        quarterly = _filter_quarterly(entries, None)
        return quarterly[0] if quarterly else None

    if period_filter.kind == "annual":
        annual = _filter_annual(entries, period_filter.fiscal_year)
        if annual:
            return annual[0]
        return None

    quarterly = _filter_quarterly(entries, period_filter.fiscal_year)
    if period_filter.fp:
        by_fp = [e for e in quarterly if e.get("fp") == period_filter.fp]
        if by_fp:
            quarterly = by_fp
    if period_filter.form:
        form_norm = period_filter.form.replace("/A", "").upper()
        by_form = [
            e
            for e in quarterly
            if (e.get("form") or "").replace("/A", "").upper() == form_norm
        ]
        if by_form:
            quarterly = by_form
    if period_filter.report_date:
        exact = [e for e in quarterly if e.get("end") == period_filter.report_date]
        if exact:
            return exact[0]
    return quarterly[0] if quarterly else None


def _extract_statement_rows(
    gaap: dict[str, Any],
    line_defs: list[dict[str, Any]],
    period_filter: Any | None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for defn in line_defs:
        obs: dict[str, Any] | None = None
        matched_concept: str | None = None
        unit = ""
        for concept_name in defn["concepts"]:
            concept_data = gaap.get(concept_name)
            if not concept_data:
                continue
            unit, entries = _unit_entries(concept_data)
            candidate = _pick_observation_for_period(entries, period_filter)
            if candidate is not None and candidate.get("val") is not None:
                obs = candidate
                matched_concept = concept_name
                break
        if obs is None or matched_concept is None:
            continue
        rows.append(
            {
                "key": defn["key"],
                "label": defn.get("label", matched_concept),
                "concept": matched_concept,
                "unit": unit,
                "value": obs.get("val"),
                "fy": obs.get("fy"),
                "fp": obs.get("fp"),
                "end": obs.get("end"),
                "form": obs.get("form"),
            }
        )
    return rows


def _period_meta_from_filter(period_filter: Any | None, rows: list[dict[str, Any]]) -> dict[str, Any]:
    if period_filter and period_filter.kind == "annual":
        annual_rows = [r for r in rows if r.get("fp") == "FY"]
        ref = annual_rows[0] if annual_rows else (rows[0] if rows else None)
        meta: dict[str, Any] = {
            "kind": "annual",
            "fy": period_filter.fiscal_year,
            "fp": "FY",
        }
        if ref:
            meta["end"] = ref.get("end")
            meta["form"] = ref.get("form")
        return meta

    if rows:
        first = rows[0]
        return {
            "kind": "interim" if first.get("fp") in ("Q1", "Q2", "Q3", "Q4") else "annual",
            "fy": first.get("fy"),
            "fp": first.get("fp"),
            "end": first.get("end"),
            "form": first.get("form"),
        }
    if period_filter is None:
        return {"kind": None}
    if period_filter.kind == "annual":
        return {"kind": "annual", "fy": period_filter.fiscal_year, "fp": "FY"}
    return {
        "kind": "interim",
        "fy": period_filter.fiscal_year,
        "fp": period_filter.fp,
        "end": period_filter.report_date,
        "form": period_filter.form,
    }


def extract_statement_tables(
    facts: dict[str, Any],
    *,
    fiscal_year: int | None = None,
    period: str | None = None,
) -> dict[str, Any]:
    """Extract full GAAP statement line items for one reporting period from companyfacts."""
    from sec.filing_periods import resolve_period_filter

    gaap = (facts.get("facts") or {}).get("us-gaap") or {}
    period_filter = resolve_period_filter(fiscal_year, period)

    def _build_tables(pf: Any | None) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        built: dict[str, Any] = {}
        rows_out: list[dict[str, Any]] = []
        for stmt_key, lines, label in STATEMENT_TABLE_DEFS:
            rows = _extract_statement_rows(gaap, lines, pf)
            built[stmt_key] = {"label": label, "rows": rows}
            rows_out.extend(rows)
        return built, rows_out

    statements, all_rows = _build_tables(period_filter)
    used_filter = period_filter

    if (
        period_filter
        and period_filter.kind == "annual"
        and not all_rows
        and period_filter.fiscal_year is not None
    ):
        from sec.filing_periods import PeriodFilter

        interim_filter = PeriodFilter(kind="interim", fiscal_year=period_filter.fiscal_year)
        statements, all_rows = _build_tables(interim_filter)
        used_filter = interim_filter

    result = {
        "period": _period_meta_from_filter(used_filter, all_rows),
        "statements": statements,
    }
    return result


def extract_financial_metrics(
    facts: dict[str, Any],
    *,
    fiscal_year: int | None = None,
    report_date: str | None = None,
) -> dict[str, Any]:
    """Map raw companyfacts payload to compare-friendly metrics."""
    metric_defs = _metric_defs_from_concepts(METRIC_CONCEPTS, METRIC_LABELS)
    metrics = _extract_metrics_from_defs(
        facts,
        metric_defs,
        fiscal_year=fiscal_year,
        report_date=report_date,
    )
    annual_summary = _build_annual_summary(metrics)

    return {
        "entity_name": facts.get("entityName"),
        "cik": str(facts.get("cik", "")).zfill(10),
        "metrics": metrics,
        "annual_summary": annual_summary,
    }


def extract_note_sections(
    facts: dict[str, Any],
    *,
    fiscal_year: int | None = None,
    filing_html: bytes | None = None,
) -> dict[str, Any]:
    """Map companyfacts + optional iXBRL HTML to footnote section metrics and disclosures."""
    return extract_note_disclosures(facts, filing_html, fiscal_year=fiscal_year)


def extract_note_disclosures(
    facts: dict[str, Any],
    filing_html: bytes | None = None,
    *,
    fiscal_year: int | None = None,
    report_date: str | None = None,
) -> dict[str, Any]:
    """Map companyfacts and iXBRL HTML to footnote metrics and narrative disclosure blocks."""
    html = filing_html.decode("utf-8", errors="replace") if filing_html else ""
    notes: dict[str, Any] = {}

    section_ids = set(NOTE_SECTION_METRICS) | set(NOTE_SECTION_TEXT_BLOCKS)
    for section_id in section_ids:
        metric_defs = NOTE_SECTION_METRICS.get(section_id, [])
        block_defs = NOTE_SECTION_TEXT_BLOCKS.get(section_id, [])

        metrics = (
            _extract_metrics_from_defs(
                facts,
                metric_defs,
                fiscal_year=fiscal_year,
                report_date=report_date,
            )
            if metric_defs
            else {}
        )
        disclosures = _extract_disclosures_from_html(html, block_defs) if html and block_defs else []

        if not metrics and not disclosures:
            continue

        annual_summary = _build_annual_summary(metrics) if metrics else []
        notes[section_id] = {
            "section_id": section_id,
            "label": _note_section_label(section_id),
            "metrics": metrics,
            "annual_summary": annual_summary,
            "disclosures": disclosures,
            "has_data": bool(metrics or disclosures),
        }

    return notes


async def fetch_ticker_financial_statements(
    ticker: str,
    fiscal_year: int | None = None,
    period: str | None = None,
    *,
    ticker_map: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Resolve ticker, load cached companyfacts, return full statement tables."""
    started = time.perf_counter()
    resolved = await resolve_ticker(ticker, ticker_map)
    facts, from_cache = await fetch_company_facts(resolved["cik"])
    extracted = extract_statement_tables(facts, fiscal_year=fiscal_year, period=period)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)

    return {
        "ticker": resolved["ticker"],
        "cik": resolved["cik"],
        "entity_name": facts.get("entityName") or resolved["company_name"],
        "fiscal_year_filter": fiscal_year,
        "period_filter": period,
        "source": "sec_companyfacts",
        "from_cache": from_cache,
        "fetch_ms": elapsed_ms,
        **extracted,
    }


async def fetch_ticker_financials(
    ticker: str,
    fiscal_year: int | None = None,
    *,
    period: str | None = None,
    ticker_map: dict[str, dict[str, Any]] | None = None,
    headline_only: bool = False,
) -> dict[str, Any]:
    """Resolve ticker, fetch companyfacts, return structured financial metrics."""
    from sec.filing_periods import parse_period_param

    started = time.perf_counter()
    resolved = await resolve_ticker(ticker, ticker_map)
    facts, from_cache = await fetch_company_facts(resolved["cik"])
    pf = parse_period_param(period)
    report_date = pf.report_date if pf and pf.kind == "interim" else None
    extracted = extract_financial_metrics(
        facts,
        fiscal_year=fiscal_year,
        report_date=report_date,
    )
    notes_xbrl: dict[str, Any] = {}
    if not headline_only:
        filing_html = _load_cached_filing_html(resolved["cik"], fiscal_year)
        notes_xbrl = extract_note_disclosures(
            facts,
            filing_html,
            fiscal_year=fiscal_year,
            report_date=report_date,
        )
    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)

    cik_padded = str(int(resolved["cik"])).zfill(10)
    return {
        "ticker": resolved["ticker"],
        "cik": resolved["cik"],
        "entity_name": extracted.get("entity_name") or resolved["company_name"],
        "fiscal_year_filter": fiscal_year,
        "source": "sec_companyfacts",
        "api_url": COMPANYFACTS_URL.format(cik=cik_padded),
        "from_cache": from_cache,
        "fetch_ms": elapsed_ms,
        "notes_xbrl": notes_xbrl,
        **{k: v for k, v in extracted.items() if k not in ("entity_name", "cik")},
    }


async def fetch_tickers_financials_stream(
    tickers: list[str],
    fiscal_year: int | None = None,
    *,
    period: str | None = None,
    headline_only: bool = False,
) -> AsyncIterator[str]:
    """Stream headline/full financials for multiple tickers; one ticker map fetch."""
    ordered = [t.upper().strip() for t in tickers if t.strip()]
    unique = list(dict.fromkeys(ordered))
    if not unique:
        yield json.dumps({"type": "done"}) + "\n"
        return

    yield json.dumps({"type": "start", "tickers": unique}) + "\n"

    ticker_map = await fetch_ticker_map()

    async def _fetch_one(ticker: str) -> tuple[str, dict[str, Any] | None, str | None]:
        try:
            data = await fetch_ticker_financials(
                ticker,
                fiscal_year,
                period=period,
                ticker_map=ticker_map,
                headline_only=headline_only,
            )
            return ticker, data, None
        except Exception as exc:
            return ticker, None, str(exc)

    tasks = {asyncio.create_task(_fetch_one(t)): t for t in unique}
    for task in asyncio.as_completed(tasks):
        ticker, data, err = await task
        if data is not None:
            yield json.dumps({"type": "financial", "ticker": ticker, "financials": data}) + "\n"
        else:
            yield json.dumps({"type": "error", "ticker": ticker, "message": err or "unknown"}) + "\n"

    yield json.dumps({"type": "done"}) + "\n"
