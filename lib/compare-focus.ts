import { resolveDefaultActiveSection } from "@/lib/sections";

export interface CompareFocusParams {
  section: string | null;
  ticker: string | null;
  row: string | null;
}

type SearchParamsLike = { get: (key: string) => string | null };

export function parseCompareFocusParams(searchParams: SearchParamsLike): CompareFocusParams {
  return {
    section: searchParams.get("section"),
    ticker: searchParams.get("ticker"),
    row: searchParams.get("row"),
  };
}

/** Prefer deep-linked section when it exists in parse index or full section catalog. */
export function resolveCompareActiveSection(
  navigableSectionIds: string[],
  catalogSectionIds: string[],
  deepLinkSection: string | null
): string | null {
  if (deepLinkSection) {
    if (navigableSectionIds.includes(deepLinkSection)) return deepLinkSection;
    if (catalogSectionIds.includes(deepLinkSection)) return deepLinkSection;
  }
  return resolveDefaultActiveSection(navigableSectionIds);
}

export function compareFocusHandled(
  focus: CompareFocusParams,
  resolvedSection: string | null
): boolean {
  return Boolean(focus.section && resolvedSection === focus.section);
}
