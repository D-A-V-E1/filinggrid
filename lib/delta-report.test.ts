import { describe, expect, it } from "vitest";
import type { DeltaFlag } from "@/lib/delta-types";
import {
  buildDeltaReportSnapshot,
  deltaReportToCsv,
  isDeltaReportDownloadReady,
} from "./delta-report";

function flag(overrides: Partial<DeltaFlag> & Pick<DeltaFlag, "ruleId" | "ticker" | "sectionId">): DeltaFlag {
  return {
    id: `${overrides.ruleId}:${overrides.ticker}:${overrides.sectionId}`,
    level: "L1",
    severity: "P2",
    label: "test",
    ...overrides,
  };
}

const BASE_INPUT = {
  peerSlug: "nvda-amd",
  tickers: ["NVDA", "AMD"],
  period: { fiscalYear: 2025 } as const,
  periodLabel: "FY 2025",
  flags: [
    flag({ ruleId: "missing_section", ticker: "AMD", sectionId: "note-leases" }),
    flag({ ruleId: "value_delta", ticker: "NVDA", sectionId: "note-leases" }),
  ],
  scannedSections: 42,
  sectionsWithDeltas: 1,
  catalog: [{ id: "note-leases", label: "Leases" }],
  columns: [
    { ticker: "NVDA", sections: ["note-leases"] },
    { ticker: "AMD", sections: [] },
  ],
};

describe("isDeltaReportDownloadReady", () => {
  it("blocks download while settling or empty", () => {
    expect(
      isDeltaReportDownloadReady({ deltasSettling: true, mapFlagsCount: 5, hasData: true })
    ).toBe(false);
    expect(
      isDeltaReportDownloadReady({ deltasSettling: false, mapFlagsCount: 0, hasData: true })
    ).toBe(false);
    expect(
      isDeltaReportDownloadReady({ deltasSettling: false, mapFlagsCount: 3, hasData: false })
    ).toBe(false);
  });

  it("allows download when settled with flags and data", () => {
    expect(
      isDeltaReportDownloadReady({ deltasSettling: false, mapFlagsCount: 3, hasData: true })
    ).toBe(true);
  });
});

describe("buildDeltaReportSnapshot", () => {
  it("uses live flag count and provided generatedAt", () => {
    const snapshot = buildDeltaReportSnapshot({
      ...BASE_INPUT,
      generatedAt: "2026-06-30T12:00:00.000Z",
    });

    expect(snapshot.flagCount).toBe(2);
    expect(snapshot.flags).toHaveLength(2);
    expect(snapshot.tickers).toEqual(["NVDA", "AMD"]);
    expect(snapshot.periodLabel).toBe("FY 2025");
    expect(snapshot.generatedAt).toBe("2026-06-30T12:00:00.000Z");
    expect(snapshot.scannedSections).toBe(42);
    expect(snapshot.sectionsWithDeltas).toBe(1);
  });
});

describe("deltaReportToCsv", () => {
  it("includes accurate metadata for current snapshot", () => {
    const snapshot = buildDeltaReportSnapshot({
      ...BASE_INPUT,
      generatedAt: "2026-06-30T12:00:00.000Z",
    });
    const csv = deltaReportToCsv(snapshot);

    expect(csv).toContain("# Delta report: NVDA · AMD");
    expect(csv).toContain("# Period: FY 2025");
    expect(csv).toContain("# Generated: 2026-06-30T12:00:00.000Z");
    expect(csv).toContain("# Scanned 42 sections · 2 differences across 1 sections");
    expect(csv).toContain("Section,NVDA,AMD");
    expect(csv).toContain("Leases");
  });
});
