import { describe, expect, it, beforeEach } from "vitest";
import {
  bumpMapFlagCountFloor,
  clearCompareSession,
  peekCompareSession,
  saveCompareSession,
  shouldSkipCompareReload,
} from "./compare-session-store";

const CACHE_KEY = "nvda-amd|annual-2025";

describe("compare-session-store", () => {
  beforeEach(() => {
    clearCompareSession(CACHE_KEY);
  });

  it("skips reload when a settled session exists", () => {
    saveCompareSession(CACHE_KEY, {
      data: null,
      financialsByTicker: {},
      financialsErrors: {},
      error: "",
      sectionsParseError: "",
      upgradedTickers: [],
      mapFlagCountFloor: 3,
      settled: true,
    });

    expect(shouldSkipCompareReload(CACHE_KEY)).toBe(true);
    expect(peekCompareSession(CACHE_KEY)?.mapFlagCountFloor).toBe(3);
  });

  it("keeps map flag count floor monotonic", () => {
    bumpMapFlagCountFloor(CACHE_KEY, 4);
    bumpMapFlagCountFloor(CACHE_KEY, 2);
    expect(peekCompareSession(CACHE_KEY)?.mapFlagCountFloor).toBe(4);
  });
});
