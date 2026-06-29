import type { FilingColumn } from "@/lib/api";
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
    /operating\s*and\s*financial\s*review/i,
    /management.s\s*discussion/i,
    /^md&a\b/i,
    /discussion\s*and\s*analysis/i,
    /financial\s*condition\s*and\s*results/i,
    /^results\s*of\s*operations/i,
  ],
  "market-risk": [/quantitative.*qualitative.*market/i, /\bmarket\s*risk\b/i],
  "legal-proceedings": [/legal\s*and\s*administrative\s*proceed/i, /legal\s*proceed/i],
  "financial-statements": [
    /condensed\s*consolidated\s*financial/i,
    /condensed\s*consolidated\s*statements/i,
    /consolidated\s*statements\s*of/i,
    /^financial\s*statements\b/i,
  ],
  controls: [/controls\s*and\s*procedures/i],
  business: [/information\s*on\s*the\s*company/i],
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

function sectionTextMatchesAlias(section: FilingColumn["sections"][number], sectionId: string): boolean {
  const patterns = SECTION_HEADING_ALIASES[sectionId];
  if (!patterns?.length) return false;
  const haystack = `${section.heading ?? ""} ${section.label ?? ""}`.trim();
  if (!haystack) return false;
  return patterns.some((re) => re.test(haystack));
}

/** True when the column exposes a catalog section by id or foreign/interim heading alias. */
export function columnHasCatalogSection(col: FilingColumn, sectionId: string): boolean {
  if (col.sections.some((s) => s.id === sectionId)) return true;
  return col.sections.some((s) => sectionTextMatchesAlias(s, sectionId));
}

/** Skip missing_section when foreign/interim form norms explain the gap vs domestic peers. */
export function shouldSuppressMissingSection(
  col: FilingColumn,
  sectionId: string,
  period?: string
): boolean {
  const form = resolveColumnForm(col, period);
  if (isForeignForm(form) && FOREIGN_OPTIONAL_SECTION_IDS.has(sectionId)) return true;
  if (isInterimPeriod(period) && INTERIM_OPTIONAL_SECTION_IDS.has(sectionId)) return true;
  return false;
}
