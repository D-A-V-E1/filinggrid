import { describe, expect, it } from "vitest";
import type { DeltaFlag } from "@/lib/delta-types";
import {
  HEADLINE_STRIP_RESERVE,
  MAINSTREAM_STRIP_CAP,
  MISSING_SECTION_STRIP_CAP,
  countMainstreamStripFlags,
  countMapWorthyFlagsByTicker,
  filterMainstreamStripFlags,
  filterMapWorthyFlags,
  isMainstreamStripFlag,
  rankMainstreamStrip,
} from "@/lib/delta-surface";

function flag(overrides: Partial<DeltaFlag> & Pick<DeltaFlag, "ruleId" | "ticker" | "sectionId">): DeltaFlag {
  return {
    id: `${overrides.ruleId}:${overrides.ticker}:${overrides.sectionId}`,
    level: "L1",
    severity: "P2",
    label: "test",
    ...overrides,
  };
}

describe("isMainstreamStripFlag", () => {
  it("includes P1/P2 missing_section and excludes rollups", () => {
    expect(
      isMainstreamStripFlag(
        flag({ ruleId: "missing_section", ticker: "AAPL", sectionId: "note-leases", severity: "P1" })
      )
    ).toBe(true);
    expect(
      isMainstreamStripFlag(
        flag({ ruleId: "missing_section", ticker: "AAPL", sectionId: "note-leases", severity: "P2" })
      )
    ).toBe(true);
    expect(
      isMainstreamStripFlag(
        flag({ ruleId: "missing_section", ticker: "AAPL", sectionId: "note-leases", severity: "P3" })
      )
    ).toBe(false);
    expect(
      isMainstreamStripFlag(
        flag({
          ruleId: "topic_only_peer",
          ticker: "MSFT",
          sectionId: "financial-statements",
          severity: "P3",
          metadata: { rollupCount: 4 },
        })
      )
    ).toBe(false);
  });

  it("still restricts topic_only_peer to high-signal sections", () => {
    expect(
      isMainstreamStripFlag(
        flag({ ruleId: "topic_only_peer", ticker: "MSFT", sectionId: "note-impairment" })
      )
    ).toBe(true);
    expect(
      isMainstreamStripFlag(
        flag({ ruleId: "topic_only_peer", ticker: "MSFT", sectionId: "note-revenue" })
      )
    ).toBe(false);
  });
});

describe("rankMainstreamStrip", () => {
  it(`caps at ${MAINSTREAM_STRIP_CAP} when mixed mainstream flags exceed cap`, () => {
    const missing = Array.from({ length: 5 }, (_, i) =>
      flag({
        ruleId: "missing_section",
        ticker: `T${i}`,
        sectionId: `note-${i}`,
        severity: "P2",
        label: `missing ${i}`,
      })
    );
    const headlines = [
      flag({
        ruleId: "headline_vs_median",
        ticker: "AAPL",
        sectionId: "financial-statements",
        level: "L0",
        label: "AAPL revenue high",
      }),
      flag({
        ruleId: "headline_only_peer",
        ticker: "MSFT",
        sectionId: "financial-statements",
        level: "L0",
        severity: "P1",
        label: "MSFT only negative net income",
      }),
    ];
    const governance = Array.from({ length: 5 }, (_, i) =>
      flag({
        ruleId: "open_staff_comments",
        ticker: `G${i}`,
        sectionId: "unresolved-staff",
        severity: "P1",
        label: `staff ${i}`,
      })
    );
    const flags = [...missing, ...headlines, ...governance];

    expect(filterMainstreamStripFlags(flags)).toHaveLength(12);
    expect(countMainstreamStripFlags(flags)).toBe(12);
    expect(rankMainstreamStrip(flags)).toHaveLength(MAINSTREAM_STRIP_CAP);
    expect(rankMainstreamStrip(flags).filter((f) => f.ruleId.startsWith("headline_"))).toHaveLength(2);
  });

  it("reserves headline slots when P1 missing_section flags outscore headline movers", () => {
    const headline = flag({
      ruleId: "headline_vs_median",
      ticker: "NVDA",
      sectionId: "financial-statements",
      level: "L0",
      severity: "P2",
      label: "NVDA revenue well above peer median",
    });
    const missing = Array.from({ length: 10 }, (_, i) =>
      flag({
        ruleId: "missing_section",
        ticker: "NVDA",
        sectionId: `note-${i}`,
        severity: "P1",
        label: `NVDA missing note ${i}`,
      })
    );

    const strip = rankMainstreamStrip([...missing, headline]);
    expect(strip.filter((f) => f.ruleId === "headline_vs_median")).toHaveLength(1);
    expect(strip.slice(0, HEADLINE_STRIP_RESERVE).some((f) => f.ruleId === "headline_vs_median")).toBe(
      true
    );
  });

  it(`caps missing_section pills at ${MISSING_SECTION_STRIP_CAP} on the strip`, () => {
    const missing = Array.from({ length: 8 }, (_, i) =>
      flag({
        ruleId: "missing_section",
        ticker: "NVDA",
        sectionId: `note-${i}`,
        severity: "P1",
        label: `NVDA missing note ${i}`,
      })
    );
    const governance = flag({
      ruleId: "open_staff_comments",
      ticker: "MSFT",
      sectionId: "unresolved-staff",
      severity: "P1",
      label: "MSFT open SEC staff comments",
    });

    const strip = rankMainstreamStrip([...missing, governance]);
    expect(strip.filter((f) => f.ruleId === "missing_section").length).toBeLessThanOrEqual(
      MISSING_SECTION_STRIP_CAP
    );
    expect(strip.some((f) => f.ruleId === "open_staff_comments")).toBe(true);
  });
});

describe("countMapWorthyFlagsByTicker", () => {
  it("sums per-ticker counts to the map-worthy total", () => {
    const flags = [
      flag({ ruleId: "headline_vs_median", ticker: "AAPL", sectionId: "financial-statements", level: "L0" }),
      flag({ ruleId: "missing_section", ticker: "AAPL", sectionId: "note-leases", severity: "P2" }),
      flag({ ruleId: "open_staff_comments", ticker: "MSFT", sectionId: "unresolved-staff", severity: "P1" }),
      flag({ ruleId: "topic_only_peer", ticker: "NVDA", sectionId: "note-impairment" }),
      flag({ ruleId: "prose_number_gap", ticker: "NVDA", sectionId: "note-revenue", severity: "P2" }),
    ];
    const worthy = filterMapWorthyFlags(flags);
    const byTicker = countMapWorthyFlagsByTicker(flags);
    const sum = Object.values(byTicker).reduce((n, c) => n + c, 0);
    expect(sum).toBe(worthy.length);
    expect(byTicker.AAPL).toBe(2);
    expect(byTicker.MSFT).toBe(1);
    expect(byTicker.NVDA).toBe(1);
  });
});
