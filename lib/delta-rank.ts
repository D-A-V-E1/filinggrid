import type { DeltaFlag, DeltaPreset } from "@/lib/delta-types";

const SEVERITY_ORDER: Record<DeltaFlag["severity"], number> = {
  P1: 0,
  P2: 1,
  P3: 2,
};

const PRESET_WEIGHTS: Record<DeltaPreset, Partial<Record<DeltaFlag["ruleId"], number>>> = {
  general: {
    headline_vs_median: 10,
    headline_only_peer: 9,
    topic_only_peer: 8,
    missing_section: 7,
    open_staff_comments: 6,
    only_peer_open_staff: 6,
    disagreement_reported: 5,
    contingency_open_emphasis: 4,
    metrics_not_comparable_mixed_filers: 1,
    prose_number_gap: 2,
  },
  investing: {
    headline_vs_median: 12,
    headline_only_peer: 10,
    topic_only_peer: 6,
    missing_section: 4,
    contingency_open_emphasis: 7,
    open_staff_comments: 5,
  },
  reporting: {
    missing_section: 12,
    topic_only_peer: 8,
    open_staff_comments: 7,
    only_peer_open_staff: 7,
    headline_vs_median: 4,
  },
  accounting: {
    missing_section: 10,
    disagreement_reported: 9,
    open_staff_comments: 8,
    only_peer_open_staff: 8,
    prose_number_gap: 6,
    headline_vs_median: 3,
  },
};

function flagScore(flag: DeltaFlag, preset: DeltaPreset): number {
  const presetWeight = PRESET_WEIGHTS[preset][flag.ruleId] ?? 3;
  const severityBoost = flag.severity === "P1" ? 30 : flag.severity === "P2" ? 15 : 0;
  const l0Boost = flag.level === "L0" ? 5 : 0;
  return presetWeight + severityBoost + l0Boost;
}

function dedupeKey(flag: DeltaFlag): string {
  return `${flag.ruleId}:${flag.ticker}:${flag.sectionId}:${flag.rowKey ?? ""}`;
}

/** Rank and cap L0 strip flags (default top 7). */
export function rankDeltas(
  flags: DeltaFlag[],
  options?: { preset?: DeltaPreset; cap?: number; l0Only?: boolean }
): DeltaFlag[] {
  const preset = options?.preset ?? "general";
  const cap = options?.cap ?? 7;
  const pool = options?.l0Only ? flags.filter((f) => f.level === "L0") : flags;

  const seen = new Set<string>();
  const ranked = [...pool]
    .sort((a, b) => {
      const scoreDiff = flagScore(b, preset) - flagScore(a, preset);
      if (scoreDiff !== 0) return scoreDiff;
      const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return a.label.localeCompare(b.label);
    })
    .filter((flag) => {
      const key = dedupeKey(flag);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return ranked.slice(0, cap);
}

export function countFlagsByTicker(flags: DeltaFlag[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const flag of flags) {
    counts[flag.ticker] = (counts[flag.ticker] ?? 0) + 1;
  }
  return counts;
}
