import { describe, expect, it, beforeEach } from "vitest";
import {
  bumpMapFlagCountFloor,
  clearCompareSession,
  peekCompareSession,
  resetMapFlagCountFloor,
  saveCompareSession,
  shouldSkipCompareReload,
  snapMapFlagCountFloor,
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

  it("resets map flag count floor on fresh load", () => {
    bumpMapFlagCountFloor(CACHE_KEY, 32);
    resetMapFlagCountFloor(CACHE_KEY);
    expect(peekCompareSession(CACHE_KEY)?.mapFlagCountFloor).toBe(0);
  });

  it("snaps floor down when scan settles below monotonic peak", () => {
    bumpMapFlagCountFloor(CACHE_KEY, 27);
    snapMapFlagCountFloor(CACHE_KEY, 26);
    expect(peekCompareSession(CACHE_KEY)?.mapFlagCountFloor).toBe(26);
  });

  it("uses exact floor when session is settled (no stale merge)", () => {
    saveCompareSession(CACHE_KEY, {
      data: null,
      financialsByTicker: {},
      financialsErrors: {},
      error: "",
      sectionsParseError: "",
      upgradedTickers: [],
      mapFlagCountFloor: 27,
      settled: false,
    });
    saveCompareSession(CACHE_KEY, {
      data: null,
      financialsByTicker: {},
      financialsErrors: {},
      error: "",
      sectionsParseError: "",
      upgradedTickers: [],
      mapFlagCountFloor: 26,
      settled: true,
    });
    expect(peekCompareSession(CACHE_KEY)?.mapFlagCountFloor).toBe(26);
  });

  it("clears floor when period cache key changes", () => {
    const annualKey = "aapl-msft-nvda|annual-2025";
    const interimKey = "aapl-msft-nvda|interim-2026-Q2";
    bumpMapFlagCountFloor(annualKey, 27);
    resetMapFlagCountFloor(interimKey);
    expect(peekCompareSession(annualKey)?.mapFlagCountFloor).toBe(27);
    expect(peekCompareSession(interimKey)).toBeUndefined();
    bumpMapFlagCountFloor(interimKey, 26);
    expect(peekCompareSession(interimKey)?.mapFlagCountFloor).toBe(26);
    clearCompareSession(annualKey);
    clearCompareSession(interimKey);
  });
});
