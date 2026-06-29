import { describe, expect, it } from "vitest";
import type { FilingColumn } from "@/lib/api";
import {
  catalogSectionPreview,
  columnEligibleForMissingSectionGap,
  columnHasCatalogSection,
  columnHasReliableSectionPresence,
  columnHasSectionPresence,
  columnParseFailed,
  financialsHaveCatalogSection,
  financialsNotesXbrlPending,
  isSubstantiveSectionPreview,
  noteSectionHasXbrlContent,
  sectionsHaveCatalogSection,
  shouldSuppressMissingSection,
} from "@/lib/section-presence";

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

describe("columnHasSectionPresence xbrl fallback", () => {
  const epsColumn = col([{ id: "financial-statements", preview: "Consolidated financial statements." }]);

  const epsDisclosureFinancials = {
    ticker: "NVDA",
    cik: "0",
    entity_name: "NVIDIA",
    fiscal_year_filter: 2025,
    source: "sec_companyfacts",
    from_cache: false,
    annual_summary: [],
    notes_xbrl: {
      "note-eps": {
        section_id: "note-eps",
        label: "Earnings Per Share",
        has_data: true,
        metrics: {},
        annual_summary: [],
        disclosures: [
          {
            key: "eps_text",
            label: "Earnings per share",
            concept: "EarningsPerShareTextBlock",
            text: "Basic and diluted earnings per share are computed using the weighted-average shares outstanding.",
          },
        ],
      },
    },
  };

  it("detects note-eps from XBRL disclosures when parse index omits the note", () => {
    expect(columnHasCatalogSection(epsColumn, "note-eps")).toBe(false);
    expect(noteSectionHasXbrlContent(epsDisclosureFinancials.notes_xbrl?.["note-eps"])).toBe(true);
    expect(financialsHaveCatalogSection(epsDisclosureFinancials, "note-eps")).toBe(true);
    expect(columnHasSectionPresence(epsColumn, "note-eps", epsDisclosureFinancials)).toBe(true);
    expect(columnHasReliableSectionPresence(epsColumn, "note-eps", epsDisclosureFinancials)).toBe(true);
  });

  it("detects disclosure text when has_data is false but text blocks exist", () => {
    const note = {
      section_id: "note-revenue",
      label: "Revenue",
      has_data: false,
      metrics: {},
      annual_summary: [],
      disclosures: [
        {
          key: "revenue_text",
          label: "Revenue recognition",
          concept: "RevenueFromContractWithCustomerTextBlock",
          text: "We recognize passenger revenue when transportation is provided.",
        },
      ],
    };
    expect(noteSectionHasXbrlContent(note)).toBe(true);
    expect(
      financialsHaveCatalogSection(
        { ...epsDisclosureFinancials, notes_xbrl: { "note-revenue": note } },
        "note-revenue"
      )
    ).toBe(true);
  });
});

describe("financialsNotesXbrlPending", () => {
  const headlineFin = {
    ticker: "LUV",
    cik: "0",
    entity_name: "Southwest",
    fiscal_year_filter: 2024,
    source: "sec_companyfacts",
    from_cache: false,
    headline_only: true,
    annual_summary: [{ fy: 2024, revenue: 1 }],
    notes_xbrl: {},
  };

  it("marks note sections pending on headline-only financials", () => {
    expect(financialsNotesXbrlPending(headlineFin, "note-revenue")).toBe(true);
    expect(financialsNotesXbrlPending(headlineFin, "mda")).toBe(false);
  });

  it("excludes pending peers from missing_section gap eligibility", () => {
    const column = col([{ id: "financial-statements", preview: "Statements." }], "10-K");
    expect(columnEligibleForMissingSectionGap(column, "note-revenue", headlineFin)).toBe(false);
    expect(columnEligibleForMissingSectionGap(column, "note-revenue", { ...headlineFin, headline_only: false })).toBe(
      true
    );
  });
});

describe("columnHasReliableSectionPresence", () => {
  it("treats empty parse-index stubs as absent even when section id is indexed", () => {
    const stubColumn = col([{ id: "note-leases", preview: "" }], "10-K");
    expect(columnHasSectionPresence(stubColumn, "note-leases")).toBe(true);
    expect(columnHasReliableSectionPresence(stubColumn, "note-leases")).toBe(false);
  });

  it("requires substantive preview for parse-index hits", () => {
    const long =
      "Operating lease liabilities and right-of-use assets are recognized for leases with terms greater than twelve months.";
    const column = col([{ id: "note-leases", preview: long }], "10-K");
    expect(isSubstantiveSectionPreview(long)).toBe(true);
    expect(columnHasReliableSectionPresence(column, "note-leases")).toBe(true);
  });
});

describe("shouldSuppressMissingSection", () => {
  it("suppresses parse-failed columns", () => {
    const failed = { ...col([]), error: "parse failed" };
    expect(columnParseFailed(failed)).toBe(true);
    expect(shouldSuppressMissingSection(failed, "note-leases")).toBe(true);
  });

  it("suppresses foreign optional sections on 20-F", () => {
    expect(shouldSuppressMissingSection(col([], "20-F"), "unresolved-staff")).toBe(true);
  });

  it("suppresses interim-optional sections on 10-Q compare", () => {
    expect(
      shouldSuppressMissingSection(col([], "10-Q"), "business", "interim-2025-Q2-10-Q")
    ).toBe(true);
  });

  it("treats amended 10-K/A as domestic annual form", () => {
    expect(shouldSuppressMissingSection(col([], "10-K/A"), "business", "annual-2024")).toBe(false);
    expect(shouldSuppressMissingSection(col([], "20-F/A"), "controls")).toBe(true);
  });
});
