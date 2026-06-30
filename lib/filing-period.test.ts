import { describe, expect, it } from "vitest";
import { formFromPeriodId, normalizeComparePeriodId, sectionHtmlRequestParams } from "@/lib/filing-period";

describe("sectionHtmlRequestParams", () => {
  it("returns null period params for default compare (no URL period/year)", () => {
    expect(sectionHtmlRequestParams(null, null)).toEqual({ fiscalYear: null, period: null });
    expect(sectionHtmlRequestParams(undefined, undefined)).toEqual({ fiscalYear: null, period: null });
  });

  it("does not send column fiscal year when compare period is unset (regression)", () => {
    // Default compare: col.fiscal_year (e.g. 2026) must not reach fetchSectionHtml — backend 402s.
    expect(sectionHtmlRequestParams(null, null)).toEqual({ fiscalYear: null, period: null });
  });

  it("passes year-only compare from URL (?year=)", () => {
    expect(sectionHtmlRequestParams(null, 2024)).toEqual({
      fiscalYear: 2024,
      period: null,
    });
  });

  it("passes explicit compare period and fiscal year from URL", () => {
    expect(sectionHtmlRequestParams("annual-2024", 2024)).toEqual({
      fiscalYear: 2024,
      period: "annual-2024",
    });
  });

  it("passes interim period with resolved fiscal year", () => {
    expect(sectionHtmlRequestParams("interim-2025-Q1", 2025)).toEqual({
      fiscalYear: 2025,
      period: "interim-2025-Q1",
    });
  });

  it("works for note sections (note-eps) same as financial-statements", () => {
    // Section id is not part of params — only compare period matters for gating.
    expect(sectionHtmlRequestParams(null, null)).toEqual({ fiscalYear: null, period: null });
  });

  it("infers 6-K from interim period id suffix", () => {
    expect(formFromPeriodId("interim-2025-Q3-6K")).toBe("6-K");
    expect(normalizeComparePeriodId("interim-2025-Q3-6K")).toBe("interim-2025-Q3");
  });
});
