import { describe, expect, it } from "vitest";
import {
  filingColumnNotFiledBody,
  filingColumnNotFiledHeading,
  resolveFilingColumnContentMode,
} from "@/lib/filingColumnView";

describe("filingColumnNotFiled copy", () => {
  it("includes the catalog section label in the heading", () => {
    expect(filingColumnNotFiledHeading("Note — Segment Information")).toBe(
      "Segment Information not in this filing"
    );
    expect(filingColumnNotFiledHeading("Note — Revenue Recognition")).toBe(
      "Revenue Recognition not in this filing"
    );
  });

  it("aligns body copy with delta map not-filed tooltip", () => {
    expect(filingColumnNotFiledBody("AAPL")).toBe(
      "AAPL — section absent from this peer's report"
    );
  });
});

describe("resolveFilingColumnContentMode", () => {
  it("offers excerpt toggle for indexed footnotes without XBRL", () => {
    const mode = resolveFilingColumnContentMode({
      activeSection: "note-impairment",
      hasSectionInFiling: true,
      hasXbrlData: false,
      isStatementSection: false,
    });
    expect(mode.showSecViewer).toBe(false);
    expect(mode.showExcerptToggle).toBe(true);
    expect(mode.xbrlOnly).toBe(false);
  });

  it("does not offer excerpt when section is absent from parse index", () => {
    const mode = resolveFilingColumnContentMode({
      activeSection: "note-segments",
      hasSectionInFiling: false,
      hasXbrlData: false,
      isStatementSection: false,
    });
    expect(mode.showExcerptToggle).toBe(false);
    expect(mode.showSecViewer).toBe(false);
  });

  it("falls back to SEC viewer for financial-statements without XBRL when indexed", () => {
    const mode = resolveFilingColumnContentMode({
      activeSection: "financial-statements",
      hasSectionInFiling: true,
      hasXbrlData: false,
      isStatementSection: false,
    });
    expect(mode.showSecViewer).toBe(true);
    expect(mode.showExcerptToggle).toBe(false);
  });
});
