const ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data";

/** Pro full-statement nav sections → common iXBRL table anchor ids (10-K / 10-Q). */
export const GAAP_STATEMENT_ANCHOR_FALLBACKS: Record<string, string> = {
  income_statement: "consolidated_statements_of_operations",
  balance_sheet: "consolidated_balance_sheets",
  cash_flow: "consolidated_statements_of_cash_flows",
  stockholders_equity: "consolidated_statements_of_shareholders_equity",
};

/** Best-effort EDGAR fragment ids when parsed section metadata has no anchor (10-K / 10-Q / 20-F / 6-K variants). */
const SECTION_ANCHOR_FALLBACKS: Record<string, string> = {
  business: "item_1_business",
  "risk-factors": "item_1a_risk_factors",
  "unresolved-staff": "item_1b",
  properties: "item_2_properties",
  "legal-proceedings": "item_3_legal_proceedings",
  "mine-safety": "item_4",
  mda: "item_7",
  "market-risk": "item_7a",
  "financial-statements": "item_8",
  disagreements: "item_9",
  controls: "item_9a",
  "other-info": "item_9b",
};

export function buildFilingUrl(
  cik: string,
  accessionNoDash: string,
  primaryDocument?: string | null
): string {
  const cikInt = String(parseInt(cik, 10));
  const primary = primaryDocument || `${accessionNoDash}.htm`;
  return `${ARCHIVES_BASE}/${cikInt}/${accessionNoDash}/${primary}`;
}

export function accessionFromCacheKey(cacheKey: string): string | null {
  const parts = cacheKey.split(":");
  return parts.length >= 3 ? parts[2] : null;
}

export interface FilingUrlSource {
  cik: string;
  cache_key?: string | null;
  filing_url?: string | null;
  primary_document?: string | null;
}

export function resolveFilingUrl(source: FilingUrlSource): string | null {
  if (source.filing_url) return source.filing_url;
  if (!source.cik || !source.cache_key) return null;
  const accession = accessionFromCacheKey(source.cache_key);
  if (!accession) return null;
  return buildFilingUrl(source.cik, accession, source.primary_document);
}

export function resolveSectionAnchor(
  sectionId: string | null | undefined,
  anchor?: string | null,
  heading?: string | null
): string | null {
  if (anchor) return anchor;
  if (!sectionId) return null;

  const gaapStatementAnchor = GAAP_STATEMENT_ANCHOR_FALLBACKS[sectionId];
  if (gaapStatementAnchor) return gaapStatementAnchor;

  if (sectionId.startsWith("note-")) {
    // Footnotes inherit the financial statements anchor from the column when available.
    return null;
  }

  const headingItem = heading?.match(/item\s+(\d+[a-z]?)\b/i)?.[1]?.toLowerCase();

  if (sectionId === "mda") {
    if (headingItem === "5") return "item_5_operating_and_financial_review";
    if (headingItem === "2") return "item_2_managements_discussion_analysis_f";
    if (/operating and financial review/i.test(heading ?? "")) {
      return "item_5_operating_and_financial_review";
    }
    if (/management.s discussion/i.test(heading ?? "")) {
      return headingItem === "2"
        ? "item_2_managements_discussion_analysis_f"
        : SECTION_ANCHOR_FALLBACKS.mda ?? null;
    }
    return SECTION_ANCHOR_FALLBACKS.mda ?? null;
  }
  if (sectionId === "risk-factors") {
    if (/^[A-Z]\.\s*RISK FACTORS/i.test(heading ?? "")) return "item_3d_risk_factors";
    if (headingItem === "3") return "item_3d_risk_factors";
    return "item_1a_risk_factors";
  }
  if (sectionId === "business" && headingItem === "4") {
    return "item_4_information_on_the_company";
  }
  if (sectionId === "market-risk") {
    if (headingItem === "3") return "item_3_quantitative_qualitative_disclosu";
    if (/item\s*11/i.test(heading ?? "")) return "item_11_quantitative_qualitative_disclosu";
    if (/quantitative and qualitative disclosures about market risk/i.test(heading ?? "")) {
      return "item_11_quantitative_qualitative_disclosu";
    }
    return SECTION_ANCHOR_FALLBACKS["market-risk"] ?? null;
  }
  if (sectionId === "financial-statements" && headingItem === "1") {
    return "item_1_financial_statements";
  }
  if (sectionId === "financial-statements" && /condensed consolidated financial/i.test(heading ?? "")) {
    return "item_1_financial_statements";
  }
  if (sectionId === "financial-statements" && headingItem === "8") {
    return "item_8_financial_information";
  }
  if (sectionId === "legal-proceedings" && headingItem === "1") {
    return "item_1_legal_proceedings";
  }
  if (sectionId === "controls" && headingItem === "4") {
    return "item_4_controls_procedures";
  }
  if (sectionId === "controls" && /item\s*15/i.test(heading ?? "")) {
    return "item_15_controls_and_procedures";
  }
  if (sectionId === "business" && /information on the company/i.test(heading ?? "")) {
    return "item_4_information_on_the_company";
  }

  const fallback = SECTION_ANCHOR_FALLBACKS[sectionId];
  if (fallback) return fallback;

  if (headingItem) {
    if (headingItem === "1a") return "item_1a_risk_factors";
    if (headingItem === "2") return "item_2_managements_discussion_analysis_f";
    if (headingItem === "3") return "item_3_quantitative_qualitative_disclosu";
    if (headingItem === "4") return "item_4_controls_procedures";
    if (headingItem === "7") return "item_7";
    if (headingItem === "7a") return "item_7a";
    if (headingItem === "8") return "item_8";
    if (headingItem === "9a") return "item_9a";
  }

  return null;
}

export function buildSectionFilingUrl(
  baseUrl: string,
  sectionId?: string | null,
  anchor?: string | null,
  heading?: string | null
): string {
  const fragment = resolveSectionAnchor(sectionId, anchor, heading);
  if (!fragment) return baseUrl;
  const base = baseUrl.split("#")[0];
  return `${base}#${fragment}`;
}
