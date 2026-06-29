import type { FinancialsXbrl, ParseResponse } from "@/lib/api";

export interface CompareSessionSnapshot {
  data: ParseResponse | null;
  financialsByTicker: Record<string, FinancialsXbrl>;
  financialsErrors: Record<string, string>;
  error: string;
  sectionsParseError: string;
  upgradedTickers: string[];
  mapFlagCountFloor: number;
  settled: boolean;
}

const sessions = new Map<string, CompareSessionSnapshot>();

let activeLoadKey: string | null = null;

export function getActiveCompareLoadKey(): string | null {
  return activeLoadKey;
}

export function setActiveCompareLoadKey(key: string | null): void {
  activeLoadKey = key;
}

/** True when an in-memory settled session exists for this compare (grid ↔ report nav). */
export function shouldSkipCompareReload(cacheKey: string): boolean {
  const snap = sessions.get(cacheKey);
  if (!snap?.settled) return false;
  activeLoadKey = cacheKey;
  return true;
}

export function settledSnapshotFor(cacheKey: string): CompareSessionSnapshot | undefined {
  const snap = sessions.get(cacheKey);
  return snap?.settled ? snap : undefined;
}

export function peekCompareSession(cacheKey: string): CompareSessionSnapshot | undefined {
  return sessions.get(cacheKey);
}

export function saveCompareSession(cacheKey: string, snapshot: CompareSessionSnapshot): void {
  const prev = sessions.get(cacheKey);
  sessions.set(cacheKey, {
    ...snapshot,
    mapFlagCountFloor: Math.max(prev?.mapFlagCountFloor ?? 0, snapshot.mapFlagCountFloor),
  });
}

export function getMapFlagCountFloor(cacheKey: string): number {
  return sessions.get(cacheKey)?.mapFlagCountFloor ?? 0;
}

export function bumpMapFlagCountFloor(cacheKey: string, count: number): number {
  const prev = sessions.get(cacheKey)?.mapFlagCountFloor ?? 0;
  const next = Math.max(prev, count);
  if (next > prev) {
    const existing = sessions.get(cacheKey);
    if (existing) {
      existing.mapFlagCountFloor = next;
    } else {
      sessions.set(cacheKey, {
        data: null,
        financialsByTicker: {},
        financialsErrors: {},
        error: "",
        sectionsParseError: "",
        upgradedTickers: [],
        mapFlagCountFloor: next,
        settled: false,
      });
    }
  }
  return next;
}

export function clearCompareSession(cacheKey: string): void {
  sessions.delete(cacheKey);
}
