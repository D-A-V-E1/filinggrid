import { describe, expect, it } from "vitest";
import type { FilingColumn, FinancialsXbrl } from "@/lib/api";
import { scanDeltas } from "@/lib/delta-engine";
import type { DeltaSessionState } from "@/lib/delta-types";

const LONG_NARRATIVE =
  "During the fiscal year we evaluated goodwill and intangible assets for impairment indicators across all reporting units.";

function column(ticker: string, sections: Array<{ id: string; preview?: string }>): FilingColumn {
  return {
    ticker,
    company_name: ticker,
    cik: "0000000000",
    form: "10-K",
    filing_date: "2024-06-30",
    report_date: "2024-06-30",
    fiscal_year: 2024,
    sections: sections.map((s) => ({
      id: s.id,
      label: s.id,
      text_preview: s.preview ?? "",
    })),
    error: null,
  };
}

function noteWithMetrics(
  sectionId: string,
  fy: number,
  metrics: Record<string, number>
): FinancialsXbrl["notes_xbrl"] {
  const metricKeys = Object.keys(metrics);
  return {
    [sectionId]: {
      section_id: sectionId,
      label: sectionId,
      has_data: true,
      metrics: Object.fromEntries(metricKeys.map((k) => [k, { label: k, concept: k }])),
      annual_summary: [{ fy, ...metrics }],
    },
  };
}

function baseState(overrides: Partial<DeltaSessionState>): DeltaSessionState {
  return {
    tickers: ["MSFT", "AAPL"],
    columns: [],
    catalog: [
      { id: "note-impairment", label: "Note — Impairment" },
      { id: "note-contingencies", label: "Note — Contingencies" },
      { id: "legal-proceedings", label: "Item 3 — Legal Proceedings" },
      { id: "unresolved-staff", label: "Item 1B — Unresolved Staff Comments" },
    ],
    financialsByTicker: {},
    financialsErrors: {},
    fiscalYear: 2024,
    isPro: false,
    ...overrides,
  };
}

function flagsByRule(state: DeltaSessionState, ruleId: string, sectionId?: string) {
  return scanDeltas(state).flags.filter(
    (f) => f.ruleId === ruleId && (sectionId == null || f.sectionId === sectionId)
  );
}

describe("scanDeltas topic presence", () => {
  it("suppresses topic_only_peer for note-impairment when notes_xbrl is missing (headline scan)", () => {
    const state = baseState({
      columns: [
        column("MSFT", [{ id: "note-impairment", preview: LONG_NARRATIVE }]),
        column("AAPL", [{ id: "note-impairment", preview: "None." }]),
      ],
      financialsByTicker: {
        MSFT: { ticker: "MSFT", cik: "", entity_name: "", fiscal_year_filter: 2024, source: "sec_companyfacts", from_cache: false, annual_summary: [] },
        AAPL: { ticker: "AAPL", cik: "", entity_name: "", fiscal_year_filter: 2024, source: "sec_companyfacts", from_cache: false, annual_summary: [] },
      },
    });

    expect(flagsByRule(state, "topic_only_peer", "note-impairment")).toHaveLength(0);
  });

  it("suppresses topic_only_peer when note has disclosures but zero FY metrics", () => {
    const state = baseState({
      columns: [
        column("MSFT", [{ id: "note-impairment", preview: LONG_NARRATIVE }]),
        column("AAPL", [{ id: "note-impairment", preview: "None." }]),
      ],
      financialsByTicker: {
        MSFT: {
          ticker: "MSFT",
          cik: "",
          entity_name: "",
          fiscal_year_filter: 2024,
          source: "sec_companyfacts",
          from_cache: false,
          annual_summary: [],
          notes_xbrl: {
            "note-impairment": {
              section_id: "note-impairment",
              label: "Impairment",
              has_data: true,
              metrics: { impairment_charge: { label: "Charge", concept: "us-gaap:Impairment" } },
              annual_summary: [{ fy: 2024, impairment_charge: 0 }],
              disclosures: [{ key: "policy", label: "Policy", concept: "us-gaap:TextBlock", text: LONG_NARRATIVE }],
            },
          },
        },
        AAPL: {
          ticker: "AAPL",
          cik: "",
          entity_name: "",
          fiscal_year_filter: 2024,
          source: "sec_companyfacts",
          from_cache: false,
          annual_summary: [],
          notes_xbrl: {},
        },
      },
    });

    expect(flagsByRule(state, "topic_only_peer", "note-impairment")).toHaveLength(0);
  });

  it("flags topic_only_peer when one peer has non-zero note metrics", () => {
    const state = baseState({
      columns: [
        column("MSFT", [{ id: "note-impairment", preview: LONG_NARRATIVE }]),
        column("AAPL", [{ id: "note-impairment", preview: "None." }]),
      ],
      financialsByTicker: {
        MSFT: {
          ticker: "MSFT",
          cik: "",
          entity_name: "",
          fiscal_year_filter: 2024,
          source: "sec_companyfacts",
          from_cache: false,
          annual_summary: [],
          notes_xbrl: noteWithMetrics("note-impairment", 2024, { impairment_charge: 500_000_000 }),
        },
        AAPL: {
          ticker: "AAPL",
          cik: "",
          entity_name: "",
          fiscal_year_filter: 2024,
          source: "sec_companyfacts",
          from_cache: false,
          annual_summary: [],
          notes_xbrl: noteWithMetrics("note-impairment", 2024, { impairment_charge: 0 }),
        },
      },
    });

    const flags = flagsByRule(state, "topic_only_peer", "note-impairment");
    expect(flags).toHaveLength(1);
    expect(flags[0].ticker).toBe("MSFT");
  });

  it("still flags legal-proceedings from substantive preview without notes_xbrl", () => {
    const state = baseState({
      columns: [
        column("MSFT", [{ id: "legal-proceedings", preview: LONG_NARRATIVE }]),
        column("AAPL", [{ id: "legal-proceedings", preview: "None." }]),
      ],
    });

    const flags = flagsByRule(state, "topic_only_peer", "legal-proceedings");
    expect(flags).toHaveLength(1);
    expect(flags[0].ticker).toBe("MSFT");
  });

  it("flags governance sections from substantive preview without notes_xbrl", () => {
    const state = baseState({
      columns: [
        column("MSFT", [{ id: "unresolved-staff", preview: LONG_NARRATIVE }]),
        column("AAPL", [{ id: "unresolved-staff", preview: "None." }]),
      ],
    });

    expect(flagsByRule(state, "topic_only_peer", "unresolved-staff")).toHaveLength(1);
    expect(flagsByRule(state, "open_staff_comments", "unresolved-staff")).toHaveLength(1);
  });
});

describe("scanDeltas contingency emphasis", () => {
  it("suppresses contingency_open_emphasis on note-contingencies without notes_xbrl", () => {
    const contingencyText =
      "A material loss contingency is reasonably possible but we are unable to estimate the range of loss at this time.";

    const state = baseState({
      columns: [
        column("MSFT", [{ id: "note-contingencies", preview: contingencyText }]),
        column("AAPL", [{ id: "note-contingencies", preview: contingencyText }]),
      ],
    });

    expect(flagsByRule(state, "contingency_open_emphasis", "note-contingencies")).toHaveLength(0);
  });

  it("suppresses contingency_open_emphasis when note-contingencies has zero FY metrics", () => {
    const contingencyText =
      "A material loss contingency is reasonably possible but we are unable to estimate the range of loss at this time.";

    const state = baseState({
      columns: [
        column("MSFT", [{ id: "note-contingencies", preview: contingencyText }]),
        column("AAPL", [{ id: "note-contingencies", preview: "Standard indemnification provisions only." }]),
      ],
      financialsByTicker: {
        MSFT: {
          ticker: "MSFT",
          cik: "",
          entity_name: "",
          fiscal_year_filter: 2024,
          source: "sec_companyfacts",
          from_cache: false,
          annual_summary: [],
          notes_xbrl: noteWithMetrics("note-contingencies", 2024, { loss_contingency: 0 }),
        },
        AAPL: {
          ticker: "AAPL",
          cik: "",
          entity_name: "",
          fiscal_year_filter: 2024,
          source: "sec_companyfacts",
          from_cache: false,
          annual_summary: [],
          notes_xbrl: noteWithMetrics("note-contingencies", 2024, { loss_contingency: 0 }),
        },
      },
    });

    expect(flagsByRule(state, "contingency_open_emphasis", "note-contingencies")).toHaveLength(0);
  });
});

describe("scanDeltas prose_number_gap", () => {
  it("does not flag prose_number_gap when notes_xbrl is missing", () => {
    const state = baseState({
      columns: [column("MSFT", [{ id: "note-impairment", preview: LONG_NARRATIVE }])],
      financialsByTicker: {
        MSFT: {
          ticker: "MSFT",
          cik: "",
          entity_name: "",
          fiscal_year_filter: 2024,
          source: "sec_companyfacts",
          from_cache: false,
          annual_summary: [],
        },
      },
    });

    expect(flagsByRule(state, "prose_number_gap", "note-impairment")).toHaveLength(0);
  });
});
