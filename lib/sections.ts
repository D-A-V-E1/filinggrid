/** Pro-only full GAAP statement sections (XBRL line-item tables). */
export const GAAP_STATEMENT_SECTIONS: { id: string; label: string }[] = [
  { id: "income_statement", label: "Income Statement" },
  { id: "balance_sheet", label: "Balance Sheet" },
  { id: "cash_flow", label: "Cash Flow Statement" },
  { id: "stockholders_equity", label: "Stockholders' Equity" },
];

export const GAAP_STATEMENT_SECTION_IDS = new Set(
  GAAP_STATEMENT_SECTIONS.map((s) => s.id)
);

export function isGaapStatementSection(sectionId: string | null): boolean {
  return sectionId != null && GAAP_STATEMENT_SECTION_IDS.has(sectionId);
}

/** Navigation groups for the compare workspace section pane. */
export function getNavGroups(isPro: boolean): { title: string; ids: string[] }[] {
  const financialIds = [
    "financial-statements",
    ...(isPro ? GAAP_STATEMENT_SECTIONS.map((s) => s.id) : []),
    "disagreements",
    "controls",
    "other-info",
  ];
  return [
    {
      title: "Business & Risk",
      ids: [
        "business",
        "risk-factors",
        "unresolved-staff",
        "properties",
        "legal-proceedings",
        "mine-safety",
      ],
    },
    {
      title: "Analysis",
      ids: ["mda", "market-risk"],
    },
    {
      title: "Financials",
      ids: financialIds,
    },
    {
      title: "Footnotes",
      ids: [
        "note-summary-policies",
        "note-revenue",
        "note-segments",
        "note-cash",
        "note-investments",
        "note-fair-value",
        "note-receivables",
        "note-inventory",
        "note-ppe",
        "note-goodwill",
        "note-leases",
        "note-debt",
        "note-derivatives",
        "note-pension",
        "note-income-tax",
        "note-stock-comp",
        "note-equity",
        "note-eps",
        "note-aoci",
        "note-restructuring",
        "note-impairment",
        "note-acquisitions",
        "note-software",
        "note-related-party",
        "note-contingencies",
        "note-subsequent-events",
        "note-recent-standards",
      ],
    },
  ];
}

/** @deprecated Use getNavGroups(isPro) for tier-aware navigation. */
export const NAV_GROUPS: { title: string; ids: string[] }[] = getNavGroups(false);

/** Major narrative sections — plain text default (no XBRL fast path). */
export const NARRATIVE_SECTION_IDS = new Set([
  "business",
  "risk-factors",
  "unresolved-staff",
  "properties",
  "legal-proceedings",
  "mine-safety",
  "mda",
  "market-risk",
  "disagreements",
  "controls",
  "other-info",
]);

export function isXbrlBackedSection(sectionId: string | null): boolean {
  return (
    sectionId === "financial-statements" ||
    isGaapStatementSection(sectionId) ||
    (sectionId?.startsWith("note-") ?? false)
  );
}

export function isNarrativeSection(sectionId: string | null): boolean {
  return sectionId != null && NARRATIVE_SECTION_IDS.has(sectionId);
}

/** Flat catalog order used to align sections across filing columns. */
export function getCatalogOrder(isPro: boolean): string[] {
  return getNavGroups(isPro).flatMap((g) => g.ids);
}

export const CATALOG_ORDER: string[] = getCatalogOrder(false);

export function mergeProStatementCatalog(
  catalog: { id: string; label: string }[],
  isPro: boolean
): { id: string; label: string }[] {
  if (!isPro) return catalog;
  const byId = new Map(catalog.map((s) => [s.id, s]));
  for (const stmt of GAAP_STATEMENT_SECTIONS) {
    if (!byId.has(stmt.id)) byId.set(stmt.id, stmt);
  }
  return getCatalogOrder(true)
    .map((id) => byId.get(id))
    .filter((s): s is { id: string; label: string } => s != null);
}

export function orderSectionsByCatalog<T extends { id: string }>(
  sections: T[],
  catalogOrder: string[] = CATALOG_ORDER
): (T | null)[] {
  const map = new Map(sections.map((s) => [s.id, s]));
  return catalogOrder.map((id) => map.get(id) ?? null);
}

/** Section IDs present in at least one column — avoids rendering empty rows. */
export function getComparableSectionIds(
  columns: { sections: { id: string }[] }[],
  catalogOrder: string[] = CATALOG_ORDER,
  extraIds: string[] = []
): string[] {
  const found = new Set<string>(extraIds);
  for (const col of columns) {
    for (const s of col.sections) found.add(s.id);
  }
  return catalogOrder.filter((id) => found.has(id));
}

export const DEFAULT_ACTIVE_SECTION = "financial-statements";

/** Minimal catalog shown while XBRL financials load before HTML parse completes. */
export const FINANCIALS_BOOTSTRAP_CATALOG: { id: string; label: string }[] = [
  { id: DEFAULT_ACTIVE_SECTION, label: "Item 8 — Financial Statements" },
];

/** Prefer financial statements on load; fall back to first navigable section. */
export function resolveDefaultActiveSection(navigableSectionIds: string[]): string | null {
  if (navigableSectionIds.includes(DEFAULT_ACTIVE_SECTION)) {
    return DEFAULT_ACTIVE_SECTION;
  }
  return navigableSectionIds[0] ?? null;
}
