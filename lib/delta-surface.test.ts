import { describe, expect, it } from "vitest";
import type { DeltaFlag } from "@/lib/delta-types";
import {
  MAINSTREAM_STRIP_CAP,
  countMainstreamStripFlags,
  filterMainstreamStripFlags,
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
  it(`caps at ${MAINSTREAM_STRIP_CAP} by default`, () => {
    const flags = Array.from({ length: 12 }, (_, i) =>
      flag({
        ruleId: "missing_section",
        ticker: `T${i}`,
        sectionId: `note-${i}`,
        severity: "P2",
        label: `missing ${i}`,
      })
    );

    expect(filterMainstreamStripFlags(flags)).toHaveLength(12);
    expect(countMainstreamStripFlags(flags)).toBe(12);
    expect(rankMainstreamStrip(flags)).toHaveLength(MAINSTREAM_STRIP_CAP);
  });
});
