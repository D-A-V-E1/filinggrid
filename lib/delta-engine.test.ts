import { describe, expect, it } from "vitest";
import type { FilingColumn, FinancialsXbrl } from "@/lib/api";
import { scanDeltas } from "@/lib/delta-engine";
import type { DeltaSessionState } from "@/lib/delta-types";

const LONG_NARRATIVE =
  "During the fiscal year we evaluated goodwill and intangible assets for impairment indicators across all reporting units.";

function column(ticker: string, sections: Array<{ id: string; preview?: string; heading?: string; label?: string }>, form = "10-K"): FilingColumn {
  return {
    ticker,
    company_name: ticker,
    cik: "0000000000",
    form,
    filing_date: "2024-06-30",
    report_date: "2024-06-30",
    fiscal_year: 2024,
    sections: sections.map((s) => ({
      id: s.id,
      label: s.label ?? s.id,
      heading: s.heading ?? s.label ?? s.id,
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

function noteWithDisclosures(
  sectionId: string,
  text: string
): FinancialsXbrl["notes_xbrl"] {
  return {
    [sectionId]: {
      section_id: sectionId,
      label: sectionId,
      has_data: true,
      metrics: {},
      annual_summary: [],
      disclosures: [
        {
          key: "disclosure",
          label: "Earnings per share",
          concept: "EarningsPerShareTextBlock",
          text,
        },
      ],
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

  it("suppresses topic_only_peer on note-contingencies when peer has disclosure text but no tagged amounts", () => {
    const purchaseObligations =
      "The Company had aggregate purchase obligations of $45.2 billion, including supplier commitments and capital expenditures, expected to be paid over the next several years.";

    const state = baseState({
      columns: [
        column("MSFT", [{ id: "note-contingencies", preview: LONG_NARRATIVE }]),
        column("AAPL", [{ id: "note-contingencies", preview: purchaseObligations }]),
      ],
      period: "interim-2026-Q2-10-Q",
      fiscalYear: 2026,
      financialsByTicker: {
        MSFT: {
          ticker: "MSFT",
          cik: "",
          entity_name: "",
          fiscal_year_filter: 2026,
          source: "sec_ixbrl_filing",
          from_cache: false,
          annual_summary: [],
          notes_xbrl: noteWithMetrics("note-contingencies", 2026, { loss_contingency: 2_500_000_000 }),
        },
        AAPL: {
          ticker: "AAPL",
          cik: "",
          entity_name: "",
          fiscal_year_filter: 2026,
          source: "sec_ixbrl_filing",
          from_cache: false,
          annual_summary: [],
          notes_xbrl: noteWithDisclosures("note-contingencies", purchaseObligations),
        },
      },
    });

    expect(flagsByRule(state, "topic_only_peer", "note-contingencies")).toHaveLength(0);
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

  it("suppresses topic_only_peer when open_staff_comments already fired on unresolved-staff", () => {
    const state = baseState({
      columns: [
        column("MSFT", [{ id: "unresolved-staff", preview: LONG_NARRATIVE }]),
        column("AAPL", [{ id: "unresolved-staff", preview: "None." }]),
      ],
    });

    expect(flagsByRule(state, "topic_only_peer", "unresolved-staff")).toHaveLength(0);
    expect(flagsByRule(state, "open_staff_comments", "unresolved-staff")).toHaveLength(1);
  });
});

describe("scanDeltas governance dedupe", () => {
  it("suppresses topic_only_peer when disagreement_reported fired on disagreements", () => {
    const state = baseState({
      catalog: [
        { id: "disagreements", label: "Item 9 — Disagreements with Accountants" },
        { id: "legal-proceedings", label: "Item 3 — Legal Proceedings" },
      ],
      columns: [
        column("MSFT", [{ id: "disagreements", preview: "None." }]),
        column("AAPL", [{ id: "disagreements", preview: LONG_NARRATIVE }]),
      ],
    });

    expect(flagsByRule(state, "disagreement_reported", "disagreements")).toHaveLength(1);
    expect(flagsByRule(state, "disagreement_reported", "disagreements")[0].ticker).toBe("AAPL");
    expect(flagsByRule(state, "topic_only_peer", "disagreements")).toHaveLength(0);
  });

  it("suppresses topic_only_peer when only_peer_open_staff fired on unresolved-staff", () => {
    const state = baseState({
      columns: [
        column("MSFT", [{ id: "unresolved-staff", preview: LONG_NARRATIVE }]),
        column("AAPL", [{ id: "unresolved-staff", preview: "None." }]),
      ],
    });

    expect(flagsByRule(state, "only_peer_open_staff", "unresolved-staff")).toHaveLength(1);
    expect(flagsByRule(state, "open_staff_comments", "unresolved-staff")).toHaveLength(1);
    expect(flagsByRule(state, "topic_only_peer", "unresolved-staff")).toHaveLength(0);
  });

  it("still flags topic_only_peer on controls when no specific governance rule fired", () => {
    const state = baseState({
      catalog: [{ id: "controls", label: "Item 9A — Controls and Procedures" }],
      columns: [
        column("MSFT", [{ id: "controls", preview: LONG_NARRATIVE }]),
        column("AAPL", [{ id: "controls", preview: "None." }]),
      ],
    });

    expect(flagsByRule(state, "topic_only_peer", "controls")).toHaveLength(1);
    expect(flagsByRule(state, "topic_only_peer", "controls")[0].ticker).toBe("MSFT");
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

describe("scanDeltas headline metrics", () => {
  const INTERIM_PERIOD = "interim-2026-Q2-10-Q";

  function finWithQuarterly(
    ticker: string,
    fy: number,
    fp: string,
    metrics: Record<string, number>,
    annualSummary: FinancialsXbrl["annual_summary"] = [{ fy: fy - 1, revenue: 1 }]
  ): FinancialsXbrl {
    const metricSeries = Object.fromEntries(
      Object.entries(metrics).map(([key, value]) => [
        key,
        {
          label: key,
          concept: key,
          quarterly: [{ fy, fp, value }],
        },
      ])
    );
    return {
      ticker,
      cik: "",
      entity_name: ticker,
      fiscal_year_filter: fy,
      source: "sec_companyfacts",
      from_cache: false,
      annual_summary: annualSummary,
      metrics: metricSeries,
    };
  }

  it("uses metrics.quarterly for interim 10-Q when annual_summary lacks the selected FY", () => {
    const state = baseState({
      fiscalYear: 2026,
      period: INTERIM_PERIOD,
      columns: [column("MSFT", []), column("AAPL", [])],
      financialsByTicker: {
        MSFT: finWithQuarterly("MSFT", 2026, "Q2", { revenue: 40_000_000_000 }),
        AAPL: finWithQuarterly("AAPL", 2026, "Q2", { revenue: 130_000_000_000 }),
      },
    });

    const flags = flagsByRule(state, "headline_vs_median", "financial-statements");
    expect(flags.some((f) => f.ticker === "AAPL" && f.metadata?.metric === "revenue")).toBe(true);
  });

  it("does not fall back to prior-year annual_summary rows on interim compare", () => {
    const state = baseState({
      fiscalYear: 2026,
      period: INTERIM_PERIOD,
      columns: [column("MSFT", []), column("AAPL", [])],
      financialsByTicker: {
        MSFT: {
          ticker: "MSFT",
          cik: "",
          entity_name: "MSFT",
          fiscal_year_filter: 2026,
          source: "sec_companyfacts",
          from_cache: false,
          annual_summary: [{ fy: 2025, revenue: 40_000_000_000 }],
        },
        AAPL: {
          ticker: "AAPL",
          cik: "",
          entity_name: "AAPL",
          fiscal_year_filter: 2026,
          source: "sec_companyfacts",
          from_cache: false,
          annual_summary: [{ fy: 2025, revenue: 120_000_000_000 }],
        },
      },
    });

    expect(flagsByRule(state, "headline_vs_median")).toHaveLength(0);
  });


  it("uses interim 1.35x / 0.65x headline_vs_median thresholds on 10-Q compare", () => {
    const state = baseState({
      fiscalYear: 2026,
      period: INTERIM_PERIOD,
      columns: [column("MSFT", []), column("AAPL", [])],
      financialsByTicker: {
        MSFT: finWithQuarterly("MSFT", 2026, "Q2", { revenue: 100_000_000_000 }),
        AAPL: finWithQuarterly("AAPL", 2026, "Q2", { revenue: 220_000_000_000 }),
      },
    });

    const flags = flagsByRule(state, "headline_vs_median", "financial-statements");
    expect(flags.some((f) => f.ticker === "AAPL" && f.metadata?.metric === "revenue")).toBe(true);
  });

  it("keeps annual 1.5x / 0.5x thresholds when interim band would not fire", () => {
    const state = baseState({
      fiscalYear: 2026,
      period: INTERIM_PERIOD,
      columns: [column("MSFT", []), column("AAPL", [])],
      financialsByTicker: {
        MSFT: finWithQuarterly("MSFT", 2026, "Q2", { revenue: 100_000_000_000 }),
        AAPL: finWithQuarterly("AAPL", 2026, "Q2", { revenue: 200_000_000_000 }),
      },
    });

    expect(flagsByRule(state, "headline_vs_median", "financial-statements")).toHaveLength(0);

    const annual = baseState({
      fiscalYear: 2025,
      columns: [column("MSFT", []), column("AAPL", [])],
      financialsByTicker: {
        MSFT: {
          ticker: "MSFT",
          cik: "",
          entity_name: "MSFT",
          fiscal_year_filter: 2025,
          source: "sec_companyfacts",
          from_cache: false,
          annual_summary: [{ fy: 2025, revenue: 50_000_000_000 }],
        },
        AAPL: {
          ticker: "AAPL",
          cik: "",
          entity_name: "AAPL",
          fiscal_year_filter: 2025,
          source: "sec_companyfacts",
          from_cache: false,
          annual_summary: [{ fy: 2025, revenue: 151_000_000_000 }],
        },
      },
    });

    const annualFlags = flagsByRule(annual, "headline_vs_median", "financial-statements");
    expect(annualFlags.some((f) => f.ticker === "AAPL" && f.metadata?.metric === "revenue")).toBe(true);
  });
  it("still flags annual headline_vs_median from annual_summary", () => {
    const state = baseState({
      fiscalYear: 2025,
      columns: [column("MSFT", []), column("AAPL", [])],
      financialsByTicker: {
        MSFT: {
          ticker: "MSFT",
          cik: "",
          entity_name: "MSFT",
          fiscal_year_filter: 2025,
          source: "sec_companyfacts",
          from_cache: false,
          annual_summary: [{ fy: 2025, revenue: 50_000_000_000 }],
        },
        AAPL: {
          ticker: "AAPL",
          cik: "",
          entity_name: "AAPL",
          fiscal_year_filter: 2025,
          source: "sec_companyfacts",
          from_cache: false,
          annual_summary: [{ fy: 2025, revenue: 151_000_000_000 }],
        },
      },
    });

    const flags = flagsByRule(state, "headline_vs_median");
    expect(flags.some((f) => f.ticker === "AAPL" && f.metadata?.metric === "revenue")).toBe(true);
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

describe("scanDeltas foreign filer section alignment", () => {
  const annualCatalog = [
    { id: "risk-factors", label: "Item 1A — Risk Factors" },
    { id: "mda", label: "Item 7 — MD&A" },
    { id: "market-risk", label: "Item 7A — Market Risk" },
    { id: "controls", label: "Item 9A — Controls & Procedures" },
    { id: "unresolved-staff", label: "Item 1B — Unresolved Staff Comments" },
  ];

  it("does not flag BABA missing risk-factors when 20-F heading alias is present", () => {
    const state = baseState({
      catalog: annualCatalog,
      columns: [
        column("AMZN", [{ id: "risk-factors", preview: LONG_NARRATIVE }]),
        column("WMT", [{ id: "risk-factors", preview: LONG_NARRATIVE }]),
        column(
          "BABA",
          [{ id: "full-document", heading: "D. Risk Factors", label: "D. Risk Factors", preview: LONG_NARRATIVE }],
          "20-F"
        ),
      ],
    });

    expect(flagsByRule(state, "missing_section", "risk-factors")).toHaveLength(0);
  });

  it("suppresses missing controls for 20-F when domestic peers have Item 9A", () => {
    const state = baseState({
      catalog: annualCatalog,
      columns: [
        column("AMZN", [{ id: "controls", preview: LONG_NARRATIVE }]),
        column("WMT", [{ id: "controls", preview: LONG_NARRATIVE }]),
        column("BABA", [{ id: "mda", preview: LONG_NARRATIVE }], "20-F"),
      ],
    });

    expect(flagsByRule(state, "missing_section", "controls")).toHaveLength(0);
  });

  it("mixed interim AMZN 10-Q + BABA 6-K: mda via heading alias avoids missing_section", () => {
    const interimCatalog = [
      { id: "mda", label: "Item 2 — MD&A" },
      { id: "financial-statements", label: "Item 1 — Financial Statements" },
      { id: "market-risk", label: "Item 3 — Market Risk" },
    ];
    const state = baseState({
      catalog: interimCatalog,
      period: "interim-2025-Q3",
      fiscalYear: 2025,
      columns: [
        column("AMZN", [{ id: "mda", preview: LONG_NARRATIVE }], "10-Q"),
        column("WMT", [{ id: "mda", preview: LONG_NARRATIVE }], "10-Q"),
        column(
          "BABA",
          [
            {
              id: "full-document",
              heading: "Full Filing",
              label: "Full Document",
              preview: `${LONG_NARRATIVE} Management's Discussion and Analysis of Financial Condition and Results of Operations.`,
            },
          ],
          "6-K"
        ),
      ],
    });

    expect(flagsByRule(state, "missing_section", "mda")).toHaveLength(0);
  });

  it("AAPL/MSFT/TSM interim: no missing_section for financial-statements when TSM 6-K has exhibit preview", () => {
    const interimCatalog = [
      { id: "financial-statements", label: "Item 1 — Financial Statements" },
      { id: "note-revenue", label: "Note — Revenue Recognition" },
      { id: "note-segments", label: "Note — Segment Information" },
      { id: "note-cash", label: "Note — Cash & Cash Equivalents" },
    ];
    const state = baseState({
      catalog: interimCatalog,
      period: "interim-2025-Q1",
      fiscalYear: 2025,
      columns: [
        column("AAPL", [{ id: "financial-statements", preview: LONG_NARRATIVE }], "10-Q"),
        column("MSFT", [{ id: "financial-statements", preview: LONG_NARRATIVE }], "10-Q"),
        column(
          "TSM",
          [
            {
              id: "full-document",
              heading: "Full Filing",
              label: "Full Document",
              preview:
                "Exhibit 99.1 Consolidated Financial Statements and Notes. Revenue Recognition policies and Segment Information for operating segments. Cash and cash equivalents at end of period.",
            },
          ],
          "6-K"
        ),
      ],
    });

    expect(flagsByRule(state, "missing_section", "financial-statements")).toHaveLength(0);
    expect(flagsByRule(state, "missing_section", "note-revenue")).toHaveLength(0);
    expect(flagsByRule(state, "missing_section", "note-segments")).toHaveLength(0);
    expect(flagsByRule(state, "missing_section", "note-cash")).toHaveLength(0);
  });

  it("suppresses missing_section for TSM-style sparse 6-K full-document index", () => {
    const interimCatalog = [
      { id: "mda", label: "Item 2 — MD&A" },
      { id: "financial-statements", label: "Item 1 — Financial Statements" },
      { id: "note-revenue", label: "Note — Revenue Recognition" },
    ];
    const state = baseState({
      catalog: interimCatalog,
      period: "interim-2025-Q3",
      fiscalYear: 2025,
      columns: [
        column("AAPL", [{ id: "mda", preview: LONG_NARRATIVE }], "10-Q"),
        column("MSFT", [{ id: "mda", preview: LONG_NARRATIVE }], "10-Q"),
        column(
          "TSM",
          [
            {
              id: "full-document",
              heading: "Full Filing",
              label: "Full Document",
              preview: `${LONG_NARRATIVE} Management's Discussion and Analysis of Financial Condition and Results of Operations.`,
            },
          ],
          "6-K"
        ),
      ],
    });

    expect(flagsByRule(state, "missing_section")).toHaveLength(0);
  });

  it("does not flag TSM missing financial-statements when 6-K exhibit sections are indexed", () => {
    const interimCatalog = [
      { id: "financial-statements", label: "Item 1 — Financial Statements" },
      { id: "note-revenue", label: "Note — Revenue Recognition" },
    ];
    const state = baseState({
      catalog: interimCatalog,
      period: "interim-2025-Q3",
      fiscalYear: 2025,
      columns: [
        column("AAPL", [{ id: "financial-statements", preview: LONG_NARRATIVE }], "10-Q"),
        column("MSFT", [{ id: "financial-statements", preview: LONG_NARRATIVE }], "10-Q"),
        column(
          "TSM",
          [
            { id: "financial-statements", preview: LONG_NARRATIVE },
            { id: "note-revenue", preview: LONG_NARRATIVE },
          ],
          "6-K"
        ),
      ],
    });

    expect(flagsByRule(state, "missing_section", "financial-statements")).toHaveLength(0);
    expect(flagsByRule(state, "missing_section", "note-revenue")).toHaveLength(0);
  });

  it("emits metrics_not_comparable for mixed domestic 10-Q and foreign 6-K interim", () => {
    const state = baseState({
      period: "interim-2025-Q3",
      fiscalYear: 2025,
      columns: [
        column("AMZN", [{ id: "mda", preview: LONG_NARRATIVE }], "10-Q"),
        column("BABA", [{ id: "mda", preview: LONG_NARRATIVE }], "6-K"),
      ],
      financialsByTicker: {
        AMZN: {
          ticker: "AMZN",
          cik: "",
          entity_name: "AMZN",
          fiscal_year_filter: 2025,
          source: "sec_companyfacts",
          from_cache: false,
          annual_summary: [],
          metrics: {
            revenue: {
              label: "revenue",
              concept: "revenue",
              quarterly: [{ fy: 2025, fp: "Q3", value: 100_000_000_000 }],
            },
          },
        },
        BABA: {
          ticker: "BABA",
          cik: "",
          entity_name: "BABA",
          fiscal_year_filter: 2025,
          source: "sec_html_filing",
          from_cache: false,
          annual_summary: [],
          metrics: {
            revenue: {
              label: "revenue",
              concept: "revenue",
              quarterly: [{ fy: 2025, fp: "Q3", value: 90_000_000_000 }],
            },
          },
        },
      },
    });

    expect(flagsByRule(state, "metrics_not_comparable_mixed_filers")).toHaveLength(1);
    expect(flagsByRule(state, "headline_vs_median")).toHaveLength(0);
  });
});

describe("mega-cap note presence (live parse index patterns)", () => {
  const NOTE_CATALOG = [
    { id: "note-impairment", label: "Note — Impairment" },
    { id: "note-software", label: "Note — Software" },
    { id: "note-ppe", label: "Note — Property, Plant & Equipment" },
  ];

  /** FY25 annual parse index: AAPL omits impairment; MSFT omits software; all three file PPE. */
  const FY25_COLUMNS = [
    column(
      "AAPL",
      [
        { id: "note-software", preview: LONG_NARRATIVE },
        { id: "note-ppe", preview: LONG_NARRATIVE },
      ],
      "10-K"
    ),
    column(
      "MSFT",
      [
        { id: "note-impairment", preview: LONG_NARRATIVE },
        { id: "note-ppe", preview: LONG_NARRATIVE },
      ],
      "10-K"
    ),
    column(
      "NVDA",
      [
        { id: "note-impairment", preview: LONG_NARRATIVE },
        { id: "note-ppe", preview: LONG_NARRATIVE },
      ],
      "10-K"
    ),
  ];

  it("flags AAPL missing impairment when MSFT and NVDA both file the note", () => {
    const state = baseState({
      tickers: ["AAPL", "MSFT", "NVDA"],
      catalog: NOTE_CATALOG,
      columns: FY25_COLUMNS,
      period: "annual-2025",
      fiscalYear: 2025,
    });

    expect(flagsByRule(state, "missing_section", "note-impairment").map((f) => f.ticker)).toEqual([
      "AAPL",
    ]);
  });

  it("does not flag minority-missing notes when most peers also omit them", () => {
    const state = baseState({
      tickers: ["AAPL", "MSFT", "NVDA"],
      catalog: NOTE_CATALOG,
      columns: FY25_COLUMNS,
      period: "annual-2025",
      fiscalYear: 2025,
    });

    expect(flagsByRule(state, "missing_section", "note-software")).toHaveLength(0);
  });
});

describe("mega-cap note-eps presence (parse index vs XBRL disclosures)", () => {
  const EPS_CATALOG = [{ id: "note-eps", label: "Note — Earnings Per Share" }];

  it("does not flag NVDA missing note-eps when XBRL disclosure exists but parse index omits the note", () => {
    const state = baseState({
      tickers: ["NVDA", "AMD", "INTC"],
      catalog: EPS_CATALOG,
      columns: [
        column("NVDA", [{ id: "financial-statements", preview: LONG_NARRATIVE }]),
        column("AMD", [{ id: "note-eps", preview: LONG_NARRATIVE }]),
        column("INTC", [{ id: "note-eps", preview: LONG_NARRATIVE }]),
      ],
      period: "annual-2025",
      fiscalYear: 2025,
      financialsByTicker: {
        NVDA: {
          ticker: "NVDA",
          cik: "0",
          entity_name: "NVIDIA",
          fiscal_year_filter: 2025,
          source: "sec_companyfacts",
          from_cache: false,
          annual_summary: [],
          notes_xbrl: noteWithDisclosures(
            "note-eps",
            "Basic and diluted earnings per share are computed using weighted-average shares outstanding."
          ),
        },
      },
    });

    expect(flagsByRule(state, "missing_section", "note-eps")).toHaveLength(0);
  });

  it("still flags NVDA when peers file note-eps and neither parse index nor XBRL has the note", () => {
    const state = baseState({
      tickers: ["NVDA", "AMD", "INTC"],
      catalog: EPS_CATALOG,
      columns: [
        column("NVDA", [{ id: "financial-statements", preview: LONG_NARRATIVE }]),
        column("AMD", [{ id: "note-eps", preview: LONG_NARRATIVE }]),
        column("INTC", [{ id: "note-eps", preview: LONG_NARRATIVE }]),
      ],
      period: "annual-2025",
      fiscalYear: 2025,
    });

    expect(flagsByRule(state, "missing_section", "note-eps").map((f) => f.ticker)).toEqual(["NVDA"]);
  });
});

describe("airlines note presence (headline-only vs XBRL disclosures)", () => {
  const AIRLINE_NOTE_CATALOG = [
    { id: "note-revenue", label: "Note — Revenue Recognition" },
    { id: "note-summary-policies", label: "Note — Summary of Significant Accounting Policies" },
    { id: "note-stock-comp", label: "Note — Stock-Based Compensation" },
    { id: "note-eps", label: "Note — Earnings Per Share" },
  ];

  const REVENUE_DISCLOSURE =
    "Passenger revenue is recognized when transportation is provided. Loyalty revenue is deferred until mileage credits are redeemed.";

  function headlineOnlyFinancials(ticker: string): FinancialsXbrl {
    return {
      ticker,
      cik: "0",
      entity_name: ticker,
      fiscal_year_filter: 2024,
      source: "sec_companyfacts",
      from_cache: false,
      headline_only: true,
      annual_summary: [{ fy: 2024, revenue: 1 }],
      notes_xbrl: {},
    };
  }

  function luvDisclosureFinancials(): FinancialsXbrl {
    return {
      ticker: "LUV",
      cik: "0",
      entity_name: "Southwest",
      fiscal_year_filter: 2024,
      source: "sec_companyfacts",
      from_cache: false,
      headline_only: false,
      annual_summary: [{ fy: 2024, revenue: 1 }],
      notes_xbrl: {
        "note-revenue": {
          section_id: "note-revenue",
          label: "Revenue Recognition",
          has_data: true,
          metrics: {},
          annual_summary: [],
          disclosures: [
            {
              key: "revenue_text",
              label: "Revenue recognition",
              concept: "RevenueFromContractWithCustomerTextBlock",
              text: REVENUE_DISCLOSURE,
            },
          ],
        },
        "note-summary-policies": {
          section_id: "note-summary-policies",
          label: "Summary of Significant Accounting Policies",
          has_data: true,
          metrics: {},
          annual_summary: [],
          disclosures: [
            {
              key: "policies",
              label: "Policies",
              concept: "SignificantAccountingPoliciesTextBlock",
              text: "Basis of presentation and use of estimates for airline operations.",
            },
          ],
        },
        "note-stock-comp": {
          section_id: "note-stock-comp",
          label: "Stock-Based Compensation",
          has_data: true,
          metrics: {},
          annual_summary: [],
          disclosures: [
            {
              key: "sbc",
              label: "Stock-based compensation",
              concept: "ShareBasedCompensationTextBlock",
              text: "Restricted stock units vest over three years for eligible employees.",
            },
          ],
        },
        "note-eps": {
          section_id: "note-eps",
          label: "Earnings Per Share",
          has_data: true,
          metrics: {},
          annual_summary: [],
          disclosures: [
            {
              key: "eps",
              label: "Earnings per share",
              concept: "EarningsPerShareTextBlock",
              text: "Basic and diluted EPS use weighted-average shares outstanding.",
            },
          ],
        },
      },
    };
  }

  it("does not flag LUV missing note sections when headline-only scan lacks notes_xbrl", () => {
    const state = baseState({
      tickers: ["DAL", "UAL", "LUV"],
      catalog: AIRLINE_NOTE_CATALOG,
      columns: [
        column("DAL", [{ id: "note-revenue", preview: LONG_NARRATIVE }]),
        column("UAL", [{ id: "note-revenue", preview: LONG_NARRATIVE }]),
        column("LUV", [{ id: "financial-statements", preview: LONG_NARRATIVE }]),
      ],
      period: "annual-2024",
      fiscalYear: 2024,
      financialsByTicker: {
        DAL: headlineOnlyFinancials("DAL"),
        UAL: headlineOnlyFinancials("UAL"),
        LUV: headlineOnlyFinancials("LUV"),
      },
    });

    for (const sectionId of AIRLINE_NOTE_CATALOG.map((s) => s.id)) {
      expect(flagsByRule(state, "missing_section", sectionId)).toHaveLength(0);
    }
  });

  it("does not flag LUV when full XBRL disclosures exist but parse index omits notes", () => {
    const state = baseState({
      tickers: ["DAL", "UAL", "LUV"],
      catalog: AIRLINE_NOTE_CATALOG,
      columns: [
        column("DAL", [{ id: "note-revenue", preview: LONG_NARRATIVE }]),
        column("UAL", [{ id: "note-revenue", preview: LONG_NARRATIVE }]),
        column("LUV", [{ id: "financial-statements", preview: LONG_NARRATIVE }]),
      ],
      period: "annual-2024",
      fiscalYear: 2024,
      financialsByTicker: {
        DAL: headlineOnlyFinancials("DAL"),
        UAL: headlineOnlyFinancials("UAL"),
        LUV: luvDisclosureFinancials(),
      },
    });

    for (const sectionId of AIRLINE_NOTE_CATALOG.map((s) => s.id)) {
      expect(flagsByRule(state, "missing_section", sectionId)).toHaveLength(0);
    }
  });

  it("still flags a peer with neither parse index nor XBRL note data after full scan", () => {
    const state = baseState({
      tickers: ["DAL", "UAL", "LUV"],
      catalog: [{ id: "note-revenue", label: "Note — Revenue Recognition" }],
      columns: [
        column("DAL", [{ id: "note-revenue", preview: LONG_NARRATIVE }]),
        column("UAL", [{ id: "note-revenue", preview: LONG_NARRATIVE }]),
        column("LUV", [{ id: "financial-statements", preview: LONG_NARRATIVE }]),
      ],
      period: "annual-2024",
      fiscalYear: 2024,
      financialsByTicker: {
        DAL: headlineOnlyFinancials("DAL"),
        UAL: headlineOnlyFinancials("UAL"),
        LUV: {
          ...headlineOnlyFinancials("LUV"),
          headline_only: false,
          notes_xbrl: {},
        },
      },
    });

    expect(flagsByRule(state, "missing_section", "note-revenue").map((f) => f.ticker)).toEqual(["LUV"]);
  });
});

describe("parse-failed columns excluded from missing_section", () => {
  const CATALOG = [
    { id: "note-leases", label: "Note — Leases" },
    { id: "controls", label: "Item 9A — Controls & Procedures" },
  ];

  it("does not flag missing_section for a column that failed to parse", () => {
    const failed: FilingColumn = {
      ...column("AMD", []),
      error: "Compressed file ended before the end-of-stream marker was reached.",
      sections: [],
    };
    const state = baseState({
      tickers: ["NVDA", "AMD", "INTC"],
      catalog: CATALOG,
      columns: [
        column("NVDA", [{ id: "note-leases", preview: LONG_NARRATIVE }]),
        failed,
        column("INTC", [{ id: "note-leases", preview: LONG_NARRATIVE }]),
      ],
      period: "annual-2025",
      fiscalYear: 2025,
    });

    expect(flagsByRule(state, "missing_section")).toHaveLength(0);
  });
});

describe("scanDeltas missing_section reliability", () => {
  const LEASES_CATALOG = [{ id: "note-leases", label: "Note — Leases" }];

  it("flags a peer with empty parse stub when two peers have substantive note-leases", () => {
    const state = baseState({
      tickers: ["NVDA", "AMD", "INTC"],
      catalog: LEASES_CATALOG,
      columns: [
        column("NVDA", [{ id: "note-leases", preview: LONG_NARRATIVE }]),
        column("AMD", [{ id: "note-leases", preview: "" }]),
        column("INTC", [{ id: "note-leases", preview: LONG_NARRATIVE }]),
      ],
      period: "annual-2025",
      fiscalYear: 2025,
    });

    expect(flagsByRule(state, "missing_section", "note-leases").map((f) => f.ticker)).toEqual(["AMD"]);
  });

  it("does not emit missing_section when only one comparable column is loaded", () => {
    const state = baseState({
      tickers: ["NVDA"],
      catalog: LEASES_CATALOG,
      columns: [column("NVDA", [{ id: "note-leases", preview: LONG_NARRATIVE }])],
      period: "annual-2025",
      fiscalYear: 2025,
    });

    expect(flagsByRule(state, "missing_section")).toHaveLength(0);
  });

  it("suppresses missing_section for interim-optional business on 10-Q compare", () => {
    const state = baseState({
      catalog: [
        { id: "business", label: "Item 1 — Business" },
        { id: "mda", label: "Item 2 — MD&A" },
      ],
      period: "interim-2025-Q2-10-Q",
      fiscalYear: 2025,
      columns: [
        column("MSFT", [{ id: "business", preview: LONG_NARRATIVE }, { id: "mda", preview: LONG_NARRATIVE }], "10-Q"),
        column("AAPL", [{ id: "mda", preview: LONG_NARRATIVE }], "10-Q"),
      ],
    });

    expect(flagsByRule(state, "missing_section", "business")).toHaveLength(0);
  });

  it("assigns P1 when all but one comparable peer reliably has the section", () => {
    const state = baseState({
      tickers: ["NVDA", "AMD", "INTC"],
      catalog: LEASES_CATALOG,
      columns: [
        column("NVDA", [{ id: "note-leases", preview: LONG_NARRATIVE }]),
        column("AMD", [{ id: "financial-statements", preview: LONG_NARRATIVE }]),
        column("INTC", [{ id: "note-leases", preview: LONG_NARRATIVE }]),
      ],
      period: "annual-2025",
      fiscalYear: 2025,
    });

    const flags = flagsByRule(state, "missing_section", "note-leases");
    expect(flags).toHaveLength(1);
    expect(flags[0].ticker).toBe("AMD");
    expect(flags[0].severity).toBe("P1");
  });
});
