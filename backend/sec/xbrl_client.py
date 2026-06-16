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

import re
import time
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

# Metric key -> candidate us-gaap concept names (first match wins)
METRIC_CONCEPTS: dict[str, list[str]] = {
    "revenue": [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
    ],
    "net_income": ["NetIncomeLoss", "ProfitLoss"],
    "total_assets": ["Assets"],
    "total_liabilities": ["Liabilities"],
    "stockholders_equity": [
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ],
    "operating_income": ["OperatingIncomeLoss"],
    "eps_basic": ["EarningsPerShareBasic"],
    "eps_diluted": ["EarningsPerShareDiluted"],
    "cash": [
        "CashAndCashEquivalentsAtCarryingValue",
        "CashCashEquivalentsAndShortTermInvestments",
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

    cik_padded = str(int(cik)).zfill(10)
    url = COMPANYFACTS_URL.format(cik=cik_padded)
    client = await get_http_client()
    resp = await _rate_limited_get(client, url, data_api=True)
    resp.raise_for_status()
    data = resp.json()
    save_company_facts(cik, data)
    return data, False


def _pick_concept(gaap: dict[str, Any], candidates: list[str]) -> dict[str, Any] | None:
    """Pick the candidate concept with the most recent 10-K annual observation."""
    best: dict[str, Any] | None = None
    best_end = ""
    for name in candidates:
        concept = gaap.get(name)
        if not concept:
            continue
        _, entries = _unit_entries(concept)
        annual = _filter_annual(entries, None)
        if not annual:
            continue
        latest_end = annual[0].get("end") or ""
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


def _filter_annual(entries: list[dict[str, Any]], fiscal_year: int | None) -> list[dict[str, Any]]:
    annual = [e for e in entries if e.get("fp") == "FY" and e.get("form") in ("10-K", "10-K/A", "20-F", "20-F/A", None, "")]
    annual = [e for e in annual if e.get("form") in ("10-K", "10-K/A", "20-F", "20-F/A")]
    annual = _dedupe_observations(_sort_observations(annual))
    if fiscal_year is not None:
        annual = [e for e in annual if e.get("fy") == fiscal_year]
    return annual[:MAX_ANNUAL_PERIODS]


def _filter_quarterly(entries: list[dict[str, Any]], fiscal_year: int | None) -> list[dict[str, Any]]:
    quarterly = [
        e
        for e in entries
        if e.get("fp") in ("Q1", "Q2", "Q3", "Q4") and e.get("form") in ("10-Q", "10-Q/A")
    ]
    quarterly = _dedupe_observations(_sort_observations(quarterly))
    if fiscal_year is not None:
        quarterly = [e for e in quarterly if e.get("fy") == fiscal_year]
    return quarterly[:MAX_QUARTERLY_PERIODS]


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
            if p.get("fy") is not None:
                years.add(int(p["fy"]))
    annual_summary: list[dict[str, Any]] = []
    for fy in sorted(years, reverse=True)[:MAX_ANNUAL_PERIODS]:
        row: dict[str, Any] = {"fy": fy}
        for key, m in metrics.items():
            match = next((p for p in m.get("annual", []) if p.get("fy") == fy), None)
            if match:
                row[key] = match["value"]
                row[f"{key}_end"] = match.get("end")
        annual_summary.append(row)
    return annual_summary


def _extract_metrics_from_defs(
    gaap: dict[str, Any],
    metric_defs: list[dict[str, Any]],
    *,
    fiscal_year: int | None = None,
) -> dict[str, Any]:
    metrics: dict[str, Any] = {}
    for defn in metric_defs:
        key = defn["key"]
        concepts = defn["concepts"]
        concept = _pick_concept(gaap, concepts)
        if not concept:
            continue
        unit, entries = _unit_entries(concept)
        annual = _filter_annual(entries, fiscal_year)
        quarterly = _filter_quarterly(entries, fiscal_year)
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


def extract_financial_metrics(
    facts: dict[str, Any],
    *,
    fiscal_year: int | None = None,
) -> dict[str, Any]:
    """Map raw companyfacts payload to compare-friendly metrics."""
    gaap = (facts.get("facts") or {}).get("us-gaap") or {}
    metric_defs = _metric_defs_from_concepts(METRIC_CONCEPTS, METRIC_LABELS)
    metrics = _extract_metrics_from_defs(gaap, metric_defs, fiscal_year=fiscal_year)
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
) -> dict[str, Any]:
    """Map companyfacts and iXBRL HTML to footnote metrics and narrative disclosure blocks."""
    gaap = (facts.get("facts") or {}).get("us-gaap") or {}
    html = filing_html.decode("utf-8", errors="replace") if filing_html else ""
    notes: dict[str, Any] = {}

    section_ids = set(NOTE_SECTION_METRICS) | set(NOTE_SECTION_TEXT_BLOCKS)
    for section_id in section_ids:
        metric_defs = NOTE_SECTION_METRICS.get(section_id, [])
        block_defs = NOTE_SECTION_TEXT_BLOCKS.get(section_id, [])

        metrics = _extract_metrics_from_defs(gaap, metric_defs, fiscal_year=fiscal_year) if metric_defs else {}
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


async def fetch_ticker_financials(
    ticker: str,
    fiscal_year: int | None = None,
    *,
    ticker_map: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Resolve ticker, fetch companyfacts, return structured financial metrics."""
    started = time.perf_counter()
    resolved = await resolve_ticker(ticker, ticker_map)
    facts, from_cache = await fetch_company_facts(resolved["cik"])
    extracted = extract_financial_metrics(facts, fiscal_year=fiscal_year)
    filing_html = _load_cached_filing_html(resolved["cik"], fiscal_year)
    notes_xbrl = extract_note_disclosures(facts, filing_html, fiscal_year=fiscal_year)
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
