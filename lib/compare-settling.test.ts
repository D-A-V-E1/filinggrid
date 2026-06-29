import { describe, expect, it } from "vitest";
import { computeDeltasSettling, NOTES_UPGRADE_TIMEOUT_MS } from "./compare-settling";
import type { FinancialsXbrl } from "./api";

const headlineFin: FinancialsXbrl = {
  headline_only: true,
  notes_xbrl: {},
  financials_xbrl: {},
};

describe("computeDeltasSettling", () => {
  it("does not wait on empty notes_xbrl when headline XBRL is loaded", () => {
    expect(
      computeDeltasSettling({
        financialsDeferredPending: false,
        data: { columns: [{ ticker: "XOM" }] },
        loadingSections: false,
        loadingFinancials: false,
        loadingTickersCount: 0,
        tickers: ["XOM"],
        financialsByTicker: { XOM: headlineFin },
        financialsErrors: {},
        upgradingNotesTickers: new Set(),
        notesUpgradeStartedAt: new Map(),
      })
    ).toBe(false);
  });

  it("waits while notes upgrade is in progress", () => {
    expect(
      computeDeltasSettling({
        financialsDeferredPending: false,
        data: { columns: [{ ticker: "XOM" }] },
        loadingSections: false,
        loadingFinancials: false,
        loadingTickersCount: 0,
        tickers: ["XOM"],
        financialsByTicker: { XOM: headlineFin },
        financialsErrors: {},
        upgradingNotesTickers: new Set(["XOM"]),
        notesUpgradeStartedAt: new Map([["XOM", 1_000]]),
        now: 2_000,
      })
    ).toBe(true);
  });

  it("settles after notes upgrade timeout", () => {
    const started = 1_000;
    expect(
      computeDeltasSettling({
        financialsDeferredPending: false,
        data: { columns: [{ ticker: "XOM" }] },
        loadingSections: false,
        loadingFinancials: false,
        loadingTickersCount: 0,
        tickers: ["XOM"],
        financialsByTicker: { XOM: headlineFin },
        financialsErrors: {},
        upgradingNotesTickers: new Set(["XOM"]),
        notesUpgradeStartedAt: new Map([["XOM", started]]),
        now: started + NOTES_UPGRADE_TIMEOUT_MS + 1,
      })
    ).toBe(false);
  });

  it("skips tickers with financials errors", () => {
    expect(
      computeDeltasSettling({
        financialsDeferredPending: false,
        data: { columns: [{ ticker: "XOM" }] },
        loadingSections: false,
        loadingFinancials: false,
        loadingTickersCount: 0,
        tickers: ["XOM"],
        financialsByTicker: {},
        financialsErrors: { XOM: "Failed" },
        upgradingNotesTickers: new Set(),
        notesUpgradeStartedAt: new Map(),
      })
    ).toBe(false);
  });
});
