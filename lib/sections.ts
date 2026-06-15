/** Navigation groups for the compare workspace section pane. */
export const NAV_GROUPS: { title: string; ids: string[] }[] = [
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
    ids: ["financial-statements", "disagreements", "controls", "other-info"],
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

/** Flat catalog order used to align sections across filing columns. */
export const CATALOG_ORDER: string[] = NAV_GROUPS.flatMap((g) => g.ids);

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
  catalogOrder: string[] = CATALOG_ORDER
): string[] {
  const found = new Set<string>();
  for (const col of columns) {
    for (const s of col.sections) found.add(s.id);
  }
  return catalogOrder.filter((id) => found.has(id));
}
