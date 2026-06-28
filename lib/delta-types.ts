import type { FilingColumn, FinancialsXbrl } from "@/lib/api";

export type DeltaLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export type DeltaSeverity = "P1" | "P2" | "P3";

export type DeltaRuleId =
  | "missing_section"
  | "headline_vs_median"
  | "headline_only_peer"
  | "topic_only_peer"
  | "open_staff_comments"
  | "only_peer_open_staff"
  | "disagreement_reported"
  | "contingency_open_emphasis"
  | "metrics_not_comparable_mixed_filers"
  | "prose_number_gap";

export interface DeltaFlag {
  id: string;
  ruleId: DeltaRuleId;
  level: DeltaLevel;
  severity: DeltaSeverity;
  ticker: string;
  sectionId: string;
  label: string;
  period?: string;
  rowKey?: string;
  metadata?: Record<string, unknown>;
}

export interface DeltaSessionState {
  tickers: string[];
  columns: FilingColumn[];
  catalog: { id: string; label: string }[];
  financialsByTicker: Record<string, FinancialsXbrl>;
  financialsErrors: Record<string, string>;
  fiscalYear: number | null;
  period?: string;
  isPro: boolean;
}

export interface DeltaScanResult {
  flags: DeltaFlag[];
  columnHeat: Record<string, number>;
  mixedFilerBanner: string | null;
  coverage: {
    scannedSections: number;
    sectionsWithDeltas: number;
  };
}

export const DELTA_PRESETS = ["general", "investing", "reporting", "accounting"] as const;

export type DeltaPreset = (typeof DELTA_PRESETS)[number];
