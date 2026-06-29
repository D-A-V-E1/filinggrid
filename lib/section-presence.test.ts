import { describe, expect, it } from "vitest";
import type { FilingColumn } from "@/lib/api";
import { catalogSectionPreview, columnHasCatalogSection, sectionsHaveCatalogSection } from "@/lib/section-presence";

function col(
  sections: Array<{ id: string; heading?: string; label?: string; preview?: string }>,
  form = "6-K"
): FilingColumn {
  return {
    ticker: "TSM",
    company_name: "TSM",
    cik: "0",
    form,
    filing_date: "2025-01-01",
    report_date: "2025-01-01",
    fiscal_year: 2025,
    sections: sections.map((s) => ({
      id: s.id,
      label: s.label ?? s.id,
      heading: s.heading ?? s.label ?? s.id,
      text_preview: s.preview ?? "",
    })),
    error: null,
  };
}

describe("columnHasCatalogSection full-document fallback", () => {
  it("detects mda from full-document preview when 6-K indexer collapses", () => {
    const column = col([
      {
        id: "full-document",
        heading: "Full Filing",
        label: "Full Document",
        preview:
          "Exhibit 99.1 Consolidated Financial Statements. Management's Discussion and Analysis of Financial Condition and Results of Operations for the quarter ended March 31, 2025.",
      },
    ]);

    expect(columnHasCatalogSection(column, "mda")).toBe(true);
    expect(columnHasCatalogSection(column, "financial-statements")).toBe(true);
    expect(catalogSectionPreview(column, "mda")).toContain("Management");
  });

  it("detects note-revenue and note-segments from preview text", () => {
    const column = col([
      {
        id: "full-document",
        heading: "Full Filing",
        preview:
          "Notes to Consolidated Financial Statements include Revenue Recognition policies and Segment Information for operating segments.",
      },
    ]);

    expect(columnHasCatalogSection(column, "note-revenue")).toBe(true);
    expect(columnHasCatalogSection(column, "note-segments")).toBe(true);
  });

  it("matches TSM 20-F MD&A heading plural (reviews)", () => {
    const column = col(
      [
        {
          id: "full-document",
          heading: "OPERATING AND FINANCIAL REVIEWS AND PROSPECTS",
          preview: "Operating review narrative.",
        },
      ],
      "20-F"
    );

    expect(columnHasCatalogSection(column, "mda")).toBe(true);
  });

  it("sectionsHaveCatalogSection matches column helper for alias hits", () => {
    const sections = [
      {
        id: "full-document",
        label: "Full Document",
        heading: "Full Filing",
        text_preview:
          "Notes to Consolidated Financial Statements include Revenue Recognition policies.",
      },
    ];
    expect(sectionsHaveCatalogSection(sections, "note-revenue")).toBe(true);
    expect(sectionsHaveCatalogSection(sections, "note-impairment")).toBe(false);
  });
});
