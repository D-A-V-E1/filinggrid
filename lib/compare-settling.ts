import type { FinancialsXbrl } from "./api";

/** Stop blocking delta scan if a notes upgrade hangs. */
export const NOTES_UPGRADE_TIMEOUT_MS = 45_000;

export interface DeltasSettlingInput {
  financialsDeferredPending: boolean;
  data: unknown | null;
  loadingSections: boolean;
  loadingFinancials: boolean;
  loadingTickersCount: number;
  tickers: string[];
  financialsByTicker: Record<string, FinancialsXbrl>;
  financialsErrors: Record<string, string>;
  upgradingNotesTickers: Set<string>;
  notesUpgradeStartedAt: ReadonlyMap<string, number>;
  now?: number;
}

/** True while compare delta scan should show a loading/settling state. */
export function computeDeltasSettling(input: DeltasSettlingInput): boolean {
  const now = input.now ?? Date.now();

  if (input.financialsDeferredPending) return true;
  if (!input.data || input.loadingSections || input.loadingFinancials) return true;
  if (input.loadingTickersCount > 0) return true;

  for (const ticker of input.tickers) {
    const upper = ticker.toUpperCase();
    if (input.financialsErrors[upper]) continue;
    const fin = input.financialsByTicker[upper];
    if (!fin) return true;

    if (!input.upgradingNotesTickers.has(upper)) continue;
    const started = input.notesUpgradeStartedAt.get(upper);
    // Missing timestamp means upgrade state is stale — do not block settling forever.
    if (started == null) continue;
    if (now - started < NOTES_UPGRADE_TIMEOUT_MS) {
      return true;
    }
  }

  return false;
}

/** True while map flag count has not caught up to the monotonic session floor. */
export function isDeltaScanCatchUp(mapFlagCount: number, mapFlagCountFloor: number): boolean {
  return mapFlagCountFloor > 0 && mapFlagCount < mapFlagCountFloor;
}
