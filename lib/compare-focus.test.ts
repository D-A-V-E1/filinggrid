import { describe, expect, it } from "vitest";
import {
  compareFocusHandled,
  parseCompareFocusParams,
  resolveCompareActiveSection,
} from "./compare-focus";

describe("parseCompareFocusParams", () => {
  it("reads section, ticker, and row from search params", () => {
    const params = new URLSearchParams("section=note-acquisitions&ticker=GM&row=revenue");
    expect(parseCompareFocusParams(params)).toEqual({
      section: "note-acquisitions",
      ticker: "GM",
      row: "revenue",
    });
  });

  it("returns nulls when focus params are absent", () => {
    const params = new URLSearchParams("period=annual-2024");
    expect(parseCompareFocusParams(params)).toEqual({
      section: null,
      ticker: null,
      row: null,
    });
  });
});

describe("resolveCompareActiveSection", () => {
  const navigable = ["business", "financial-statements", "mda"];
  const catalog = [
    "business",
    "risk-factors",
    "mda",
    "market-risk",
    "financial-statements",
    "note-acquisitions",
    "note-revenue",
    "note-leases",
    "note-debt",
  ];

  it.each([
    ["note-acquisitions", "footnote from catalog when absent from parse index"],
    ["note-revenue", "footnote revenue note"],
    ["note-leases", "footnote leases note"],
    ["mda", "narrative MD&A section"],
    ["business", "narrative business section"],
    ["risk-factors", "narrative risk factors from catalog only"],
    ["financial-statements", "financial statements headline section"],
  ] as const)("prefers deep-linked %s (%s)", (sectionId) => {
    expect(resolveCompareActiveSection(navigable, catalog, sectionId)).toBe(sectionId);
  });

  it("resolves financial-statements metric row deep link before parse index fills", () => {
    expect(resolveCompareActiveSection([], catalog, "financial-statements")).toBe(
      "financial-statements"
    );
  });

  it("falls back to financial statements when deep link is unknown", () => {
    expect(resolveCompareActiveSection(navigable, catalog, "note-software")).toBe(
      "financial-statements"
    );
  });

  it("uses default when no deep link is present", () => {
    expect(resolveCompareActiveSection(navigable, catalog, null)).toBe("financial-statements");
  });

  it("falls back to first navigable section when financial-statements is absent", () => {
    const navWithoutFs = ["business", "mda"];
    expect(resolveCompareActiveSection(navWithoutFs, catalog, null)).toBe("business");
  });
});

describe("compareFocusHandled", () => {
  it.each([
    ["note-acquisitions", "note-acquisitions"],
    ["mda", "mda"],
    ["note-revenue", "note-revenue"],
    ["financial-statements", "financial-statements"],
  ] as const)("is true when resolved section matches deep link (%s)", (section, resolved) => {
    expect(
      compareFocusHandled({ section, ticker: "GM", row: null }, resolved)
    ).toBe(true);
  });

  it("is true for metric row deep links when section resolves", () => {
    expect(
      compareFocusHandled(
        { section: "financial-statements", ticker: "NVDA", row: "revenue" },
        "financial-statements"
      )
    ).toBe(true);
  });

  it("is false when deep link could not be resolved", () => {
    expect(
      compareFocusHandled(
        { section: "note-acquisitions", ticker: "GM", row: null },
        "financial-statements"
      )
    ).toBe(false);
  });
});
