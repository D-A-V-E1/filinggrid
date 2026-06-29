import { describe, expect, it } from "vitest";
import {
  POPULAR_COMPARISONS,
  POPULAR_PEER_SECTIONS,
  assertSlugMatchesTickers,
  slugFromTickers,
} from "@/lib/popular-comparisons";
import { parsePeerSlug, validateCompareTickers } from "@/lib/utils";

describe("popular peer groups catalog", () => {
  it("has unique ids and slugs across all groups", () => {
    const ids = POPULAR_COMPARISONS.map((g) => g.id);
    const slugs = POPULAR_COMPARISONS.map((g) => g.slug);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("slugFromTickers matches buildPeerSlug for every group", () => {
    for (const group of POPULAR_COMPARISONS) {
      expect(assertSlugMatchesTickers(group)).toBe(true);
      expect(slugFromTickers(group.tickers)).toBe(group.slug);
    }
  });

  it("validateCompareTickers passes for every group", () => {
    for (const group of POPULAR_COMPARISONS) {
      const parsed = parsePeerSlug(group.slug);
      expect(parsed).toEqual(group.tickers);
      expect(validateCompareTickers(group.tickers)).toBeNull();
      expect(validateCompareTickers(parsed)).toBeNull();
    }
  });

  it("sections contain at least one group each", () => {
    for (const section of POPULAR_PEER_SECTIONS) {
      expect(section.groups.length).toBeGreaterThan(0);
    }
  });
});
