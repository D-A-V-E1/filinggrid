import type { FilingColumn, FinancialsXbrl, NoteSectionXbrl } from "@/lib/api";
import { formFromPeriodId } from "@/lib/filing-period";

/** US-only Items frequently omitted on 20-F / 6-K — absence is not a catalog gap vs domestic peers. */
export const FOREIGN_OPTIONAL_SECTION_IDS = new Set([
  "unresolved-staff",
  "controls",
  "disagreements",
  "mine-safety",
  "other-info",
  "properties",
]);

/** Annual narrative sections rarely filed in interim 10-Q / 6-K earnings releases. */
export const INTERIM_OPTIONAL_SECTION_IDS = new Set([
  "business",
  "risk-factors",
  "properties",
  "mine-safety",
  "unresolved-staff",
  "disagreements",
  "other-info",
]);

/** Heading / label fallbacks when foreign filings use non-Item titles but same disclosure topic. */
const SECTION_HEADING_ALIASES: Record<string, RegExp[]> = {
  "risk-factors": [/risk\s*factors/i, /^[A-Z]\.\s*Risk\s*Factors/i],
  mda: [
    /operating\s*and\s*financial\s*reviews?/i,
    /management.s\s*discussion/i,
    /^md&a\b/i,
    /discussion\s*and\s*analysis/i,
    /financial\s*condition\s*and\s*results/i,
    /^results\s*of\s*operations/i,
  ],
  "market-risk": [/quantitative.*qualitative.*market/i, /\bmarket\s*risk/i],
  "legal-proceedings": [/legal\s*and\s*administrative\s*proceed/i, /legal\s*proceed/i],
  "financial-statements": [
    /condensed\s*consolidated\s*financial/i,
    /condensed\s*consolidated\s*statements/i,
    /consolidated\s*financial\s*statements/i,
    /consolidated\s*statements\s*of/i,
    /notes\s*to\s*consolidated\s*financial/i,
    /^financial\s*statements\b/i,
    /^item\s*18\b/i,
  ],
  controls: [/controls\s*and\s*procedures/i],
  business: [/information\s*on\s*the\s*company/i],
  "note-revenue": [/revenue\s*recognition/i],
  "note-segments": [/segment\s*information/i, /operating\s*segments/i, /reportable\s*segments/i],
  "note-cash": [/cash\s*and\s*cash\s*equivalent/i, /cash\s*equivalents/i],
  "note-summary-policies": [
    /summary\s*of\s*significant\s*accounting/i,
    /significant\s*accounting\s*polic/i,
  ],
  "note-income-tax": [/income\s*tax/i],
  "note-leases": [/\bleases\b/i],
  "note-debt": [/long.term\s*debt/i, /\bborrowings\b/i],
  "note-eps": [/earnings\s*per\s*share/i],
  "note-stock-comp": [/stock.based\s*compensation/i, /share.based\s*payment/i],
};

export function isDomesticForm(form: string | null): boolean {
  if (!form) return true;
  const base = form.replace(/\/A$/i, "").toUpperCase();
  return base === "10-K" || base === "10-Q";
}

export function isForeignForm(form: string | null): boolean {
  if (!form) return false;
  const base = form.replace(/\/A$/i, "").toUpperCase();
  return base === "20-F" || base === "6-K";
}

export function isInterimPeriod(period?: string): boolean {
  return period?.startsWith("interim-") ?? false;
}

export function resolveColumnForm(col: FilingColumn, period?: string): string | null {
  return col.form ?? formFromPeriodId(period);
}

function sectionAliasHaystack(section: FilingColumn["sections"][number]): string {
  const parts = [section.heading ?? "", section.label ?? ""];
  // 6-K / stale-parse fallback: indexer may collapse to full-document with useful preview text.
  if (section.id === "full-document") {
    parts.push(section.text_preview ?? "");
  }
  return parts.join(" ").trim();
}

function sectionTextMatchesAlias(section: FilingColumn["sections"][number], sectionId: string): boolean {
  const patterns = SECTION_HEADING_ALIASES[sectionId];
  if (!patterns?.length) return false;
  const haystack = sectionAliasHaystack(section);
  if (!haystack) return false;
  return patterns.some((re) => re.test(haystack));
}

/** Resolve a catalog section by id or foreign/interim heading alias. */
export function findCatalogSection(
  sections: FilingColumn["sections"],
  sectionId: string
): FilingColumn["sections"][number] | undefined {
  const direct = sections.find((s) => s.id === sectionId);
  if (direct) return direct;
  return sections.find((s) => sectionTextMatchesAlias(s, sectionId));
}

/** True when sections expose a catalog section by id or heading alias. */
export function sectionsHaveCatalogSection(
  sections: FilingColumn["sections"],
  sectionId: string
): boolean {
  return findCatalogSection(sections, sectionId) != null;
}

/** True when the column exposes a catalog section by id or foreign/interim heading alias. */
export function columnHasCatalogSection(col: FilingColumn, sectionId: string): boolean {
  return sectionsHaveCatalogSection(col.sections, sectionId);
}

/** Note section IDs with tagged FY amounts (`has_data`) across loaded financials — for nav when parse index omits the note. */
export function xbrlNoteSectionsWithTaggedData(
  financialsByTicker: Record<string, FinancialsXbrl | undefined>
): string[] {
  const ids = new Set<string>();
  for (const fin of Object.values(financialsByTicker)) {
    if (!fin?.notes_xbrl) continue;
    for (const [sectionId, note] of Object.entries(fin.notes_xbrl)) {
      if (note.has_data) ids.add(sectionId);
    }
  }
  return Array.from(ids);
}

/** True when XBRL note data includes tagged amounts or disclosure text blocks. */
export function noteSectionHasXbrlContent(note: NoteSectionXbrl | undefined): boolean {
  if (!note) return false;
  if ((note.disclosures?.length ?? 0) > 0) return true;
  if (!note.has_data) return false;
  return (note.annual_summary?.length ?? 0) > 0;
}

/** Note disclosures not loaded yet (headline-only financials batch). */
export function financialsNotesXbrlPending(
  financials: FinancialsXbrl | undefined,
  sectionId: string
): boolean {
  if (!sectionId.startsWith("note-")) return false;
  if (!financials) return false;
  if (financials.headline_only === true) return true;
  if (financials.headline_only === false) return false;
  const hasHeadline = (financials.annual_summary?.length ?? 0) > 0;
  const notesEmpty = !financials.notes_xbrl || Object.keys(financials.notes_xbrl).length === 0;
  return hasHeadline && notesEmpty;
}

const NONE_PREVIEW_PATTERNS =
  /^(none\.?|not applicable\.?|n\/a\.?|no unresolved|there are no|not required)/i;

/** Governance sections where heading-only Item stubs must not count as reliable presence. */
export const GOVERNANCE_SECTION_IDS = new Set([
  "unresolved-staff",
  "controls",
  "disagreements",
]);

/** Item heading / catalog label without narrative body — not reliable section presence. */
export function isGovernanceHeadingStub(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  // Bare Item labels: "Item 9.", "Item 9A."
  if (/^item\s*\d+[a-z]?\.?\s*$/i.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  // Item 9C HFCAA headings (often mis-indexed under disagreements or controls)
  if (lower.includes("foreign jurisdictions") && lower.includes("prevent inspections")) return true;
  if (/^item\s*9c\b/i.test(trimmed) && !/disagreement/i.test(trimmed)) return true;
  // Combined Part II index stubs
  if (/^item\s*9b,\s*9c,\s*1[0-3]/i.test(trimmed)) return true;
  // Catalog title only — standard Item label with no narrative body
  if (/^item\s*9a\.?\s*controls\s*(and|&)\s*procedures\.?\s*$/i.test(trimmed)) return true;
  if (/^item\s*9\.?\s*disagreements\s*(with|on)\s*accountants\.?\s*$/i.test(trimmed)) return true;
  if (/^item\s*1b\.?\s*(unresolved\s*staff\s*comments?)?\.?\s*$/i.test(trimmed)) return true;
  return false;
}

/** Material governance preview — aligns with disagreement HFCAA filters and heading-stub exclusion. */
export function isGovernanceSectionSubstantive(sectionId: string, text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (NONE_PREVIEW_PATTERNS.test(trimmed)) return false;
  if (isGovernanceHeadingStub(trimmed)) return false;
  const minLen = sectionId === "disagreements" ? 30 : 40;
  return trimmed.length >= minLen;
}

/** Non-empty parse preview — excludes indexer stubs and boilerplate "none" filings. */
export function isSubstantiveSectionPreview(text: string, minLen = 25): boolean {
  const trimmed = text.trim();
  if (trimmed.length < minLen) return false;
  if (NONE_PREVIEW_PATTERNS.test(trimmed)) return false;
  return true;
}

/** True when companyfacts expose a catalog note or financial-statements headline data. */
export function financialsHaveCatalogSection(
  financials: FinancialsXbrl | undefined,
  sectionId: string
): boolean {
  if (!financials) return false;
  if (sectionId === "financial-statements") {
    return (financials.annual_summary?.length ?? 0) > 0;
  }
  if (sectionId.startsWith("note-")) {
    return noteSectionHasXbrlContent(financials.notes_xbrl?.[sectionId]);
  }
  return false;
}

/** Parse index section or XBRL-backed catalog section — used for missing_section alignment. */
export function columnHasSectionPresence(
  col: FilingColumn,
  sectionId: string,
  financials?: FinancialsXbrl
): boolean {
  return columnHasCatalogSection(col, sectionId) || financialsHaveCatalogSection(financials, sectionId);
}

/**
 * Material section presence for peer gap rules — XBRL-backed or parse index with substantive preview.
 * Empty indexer stubs do not count as "peer has section".
 */
export function columnHasReliableSectionPresence(
  col: FilingColumn,
  sectionId: string,
  financials?: FinancialsXbrl
): boolean {
  if (financialsHaveCatalogSection(financials, sectionId)) return true;
  if (!columnHasCatalogSection(col, sectionId)) return false;
  const preview = catalogSectionPreview(col, sectionId);
  if (GOVERNANCE_SECTION_IDS.has(sectionId)) {
    return isGovernanceSectionSubstantive(sectionId, preview);
  }
  return isSubstantiveSectionPreview(preview);
}

/**
 * Eligible for missing_section gap rules — excludes peers whose note XBRL has not been scanned.
 */
export function columnEligibleForMissingSectionGap(
  col: FilingColumn,
  sectionId: string,
  financials?: FinancialsXbrl
): boolean {
  if (columnParseFailed(col)) return false;
  if (financialsNotesXbrlPending(financials, sectionId)) return false;
  if (
    sectionId.startsWith("note-") &&
    financials?.headline_only === false &&
    isForeignForm(resolveColumnForm(col)) &&
    (!financials.notes_xbrl || Object.keys(financials.notes_xbrl).length === 0)
  ) {
    return false;
  }
  return true;
}

/** Preview text for a catalog section — direct id or alias / full-document fallback. */
export function catalogSectionPreview(col: FilingColumn, sectionId: string): string {
  const direct = col.sections.find((s) => s.id === sectionId)?.text_preview?.trim();
  if (direct) return direct;
  const aliasSection = col.sections.find((s) => sectionTextMatchesAlias(s, sectionId));
  return aliasSection?.text_preview?.trim() ?? "";
}

/** True when parse fell back to a single full-document stub (common on 6-K cover pages). */
export function columnHasSparseSectionIndex(col: FilingColumn): boolean {
  if (col.sections.length !== 1) return false;
  return col.sections[0]?.id === "full-document";
}

/** True when the column failed to parse — exclude from peer gap comparisons. */
export function columnParseFailed(col: FilingColumn): boolean {
  return Boolean(col.error);
}

/** Skip missing_section when foreign/interim form norms explain the gap vs domestic peers. */
export function shouldSuppressMissingSection(
  col: FilingColumn,
  sectionId: string,
  period?: string
): boolean {
  if (columnParseFailed(col)) return true;
  const form = resolveColumnForm(col, period);
  if (isForeignForm(form) && FOREIGN_OPTIONAL_SECTION_IDS.has(sectionId)) return true;
  if (isInterimPeriod(period) && INTERIM_OPTIONAL_SECTION_IDS.has(sectionId)) return true;
  if (isForeignForm(form) && columnHasSparseSectionIndex(col)) return true;
  return false;
}
