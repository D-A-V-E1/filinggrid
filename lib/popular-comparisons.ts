import catalog from "@/data/popular-peer-groups.json";
import { buildPeerSlug } from "@/lib/utils";

export type PopularPeerGroup = {
  id: string;
  label: string;
  slug: string;
  tickers: string[];
  industryTag: string;
  sicOrSector: string;
  lastRefreshed: string;
  featured?: boolean;
};

export type PopularPeerSection = {
  id: string;
  label: string;
  groups: PopularPeerGroup[];
};

export type PopularComparison = Pick<PopularPeerGroup, "slug" | "label"> & {
  id: string;
  tickers: string[];
  industryTag: string;
  sicOrSector: string;
  lastRefreshed: string;
  featured?: boolean;
  sectionId: string;
  sectionLabel: string;
};

/** Build the canonical compare slug from ticker symbols (lowercase, -vs- joined). */
export function slugFromTickers(tickers: string[]): string {
  return buildPeerSlug(tickers);
}

function normalizeGroup(
  group: PopularPeerGroup,
  section: { id: string; label: string }
): PopularComparison {
  return {
    id: group.id,
    slug: group.slug,
    label: group.label,
    tickers: group.tickers,
    industryTag: group.industryTag,
    sicOrSector: group.sicOrSector,
    lastRefreshed: group.lastRefreshed,
    featured: group.featured,
    sectionId: section.id,
    sectionLabel: section.label,
  };
}

export const POPULAR_PEER_CATALOG_VERSION = catalog.catalogVersion;
export const POPULAR_PEER_CATALOG_LAST_REFRESH = catalog.lastCatalogRefresh;

export const POPULAR_PEER_SECTIONS: PopularPeerSection[] = catalog.sections;

/** Flat list of all curated compare presets (sitemap, SEO, legacy imports). */
export const POPULAR_COMPARISONS: PopularComparison[] = catalog.sections.flatMap(
  (section) => section.groups.map((group) => normalizeGroup(group, section))
);

export const POPULAR_COMPARE_SLUGS = POPULAR_COMPARISONS.map((c) => c.slug);

/** Featured groups for compact surfaces (home hero chips, etc.). */
export const FEATURED_POPULAR_COMPARISONS = POPULAR_COMPARISONS.filter((c) => c.featured);

export function getPopularComparisonBySlug(slug: string): PopularComparison | undefined {
  return POPULAR_COMPARISONS.find((c) => c.slug === slug);
}

/** Ensure stored slug matches ticker-derived canonical form. */
export function assertSlugMatchesTickers(group: Pick<PopularPeerGroup, "slug" | "tickers">): boolean {
  return group.slug === slugFromTickers(group.tickers);
}
