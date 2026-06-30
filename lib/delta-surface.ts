import type { DeltaFlag, DeltaRuleId } from "@/lib/delta-types";
import { rankDeltas } from "@/lib/delta-rank";

/** Default L0 strip cap — headline glance, not the full map. */
export const MAINSTREAM_STRIP_CAP = 7;

/** Always surface top headline movers when present — not crowded out by disclosure P1s. */
export const HEADLINE_STRIP_RESERVE = 2;

/** Cap missing-section pills so one peer's catalog gaps do not fill the strip. */
export const MISSING_SECTION_STRIP_CAP = 3;

const HEADLINE_STRIP_RULES = new Set<DeltaRuleId>([
  "headline_vs_median",
  "headline_only_peer",
  "note_metric_vs_median",
]);

/** Headline movers + material one-time / governance signals — default strip only. */
const MAINSTREAM_STRIP_RULES = new Set<DeltaRuleId>([
  "headline_vs_median",
  "headline_only_peer",
  "topic_only_peer",
  "missing_section",
  "open_staff_comments",
  "only_peer_open_staff",
  "disagreement_reported",
  "contingency_open_emphasis",
  "note_metric_vs_median",
]);

/** topic_only_peer is strip-eligible only on high-signal sections (events / open matters). */
const MAINSTREAM_TOPIC_SECTIONS = new Set([
  "legal-proceedings",
  "note-impairment",
  "note-contingencies",
  "note-restructuring",
  "note-acquisitions",
  "unresolved-staff",
  "controls",
  "disagreements",
]);

export const MAINSTREAM_STRIP_TAGLINE =
  "Biggest number moves, missing peer disclosures, and key one-time events — not every footnote difference.";

export function isMainstreamStripFlag(flag: DeltaFlag): boolean {
  if (flag.metadata?.rollupCount != null) return false;
  if (flag.ruleId === "metrics_not_comparable_mixed_filers") return false;
  if (!MAINSTREAM_STRIP_RULES.has(flag.ruleId)) return false;

  if (flag.ruleId === "topic_only_peer") {
    return MAINSTREAM_TOPIC_SECTIONS.has(flag.sectionId);
  }

  if (flag.ruleId === "missing_section") {
    return flag.severity === "P1" || flag.severity === "P2";
  }

  if (flag.ruleId === "contingency_open_emphasis") {
    return flag.severity !== "P3";
  }

  return true;
}

export function filterMainstreamStripFlags(flags: DeltaFlag[]): DeltaFlag[] {
  return flags.filter(isMainstreamStripFlag);
}

/**
 * Rank material movers/events for the headline strip (default cap 7).
 * Reserves slots for headline metrics, caps missing-section pills, then fills the rest by score.
 */
export function rankMainstreamStrip(flags: DeltaFlag[], cap = MAINSTREAM_STRIP_CAP): DeltaFlag[] {
  const pool = filterMainstreamStripFlags(flags);
  if (pool.length === 0) return [];

  const headlineSlots = rankDeltas(
    pool.filter((f) => HEADLINE_STRIP_RULES.has(f.ruleId)),
    { preset: "general", cap: Math.min(HEADLINE_STRIP_RESERVE, cap) }
  );
  const taken = new Set(headlineSlots.map((f) => f.id));
  let remainderCap = Math.max(0, cap - headlineSlots.length);

  const remainderPool = pool.filter((f) => !taken.has(f.id));
  const missingSlots = rankDeltas(
    remainderPool.filter((f) => f.ruleId === "missing_section"),
    { preset: "general", cap: Math.min(MISSING_SECTION_STRIP_CAP, remainderCap) }
  );
  for (const f of missingSlots) taken.add(f.id);
  remainderCap = Math.max(0, remainderCap - missingSlots.length);

  const otherSlots =
    remainderCap > 0
      ? rankDeltas(
          remainderPool.filter((f) => !taken.has(f.id) && f.ruleId !== "missing_section"),
          { preset: "general", cap: remainderCap }
        )
      : [];

  return [...headlineSlots, ...missingSlots, ...otherSlots];
}

export function countMainstreamStripFlags(flags: DeltaFlag[]): number {
  return filterMainstreamStripFlags(flags).length;
}

export function countMainstreamFlagsByTicker(flags: DeltaFlag[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const flag of filterMainstreamStripFlags(flags)) {
    counts[flag.ticker] = (counts[flag.ticker] ?? 0) + 1;
  }
  return counts;
}

/** Material cells for the section delta map — not exhaustive footnote noise. */
export function isMapWorthyFlag(flag: DeltaFlag): boolean {
  if (flag.metadata?.rollupCount != null) return false;
  if (flag.ruleId === "metrics_not_comparable_mixed_filers") return false;
  if (flag.ruleId === "prose_number_gap") return false;
  if (flag.severity === "P3") return false;

  if (isMainstreamStripFlag(flag)) return true;
  if (flag.ruleId === "missing_section") return true;

  return false;
}

export function filterMapWorthyFlags(flags: DeltaFlag[]): DeltaFlag[] {
  return flags.filter(isMapWorthyFlag);
}

export function mapWorthyCoverage(flags: DeltaFlag[]): {
  flagCount: number;
  sectionsWithDeltas: number;
} {
  const worthy = filterMapWorthyFlags(flags);
  return {
    flagCount: worthy.length,
    sectionsWithDeltas: new Set(worthy.map((f) => f.sectionId)).size,
  };
}
