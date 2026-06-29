import type { DeltaFlag, DeltaRuleId } from "@/lib/delta-types";
import { rankDeltas } from "@/lib/delta-rank";

/** Headline movers + material one-time / governance signals — default strip only. */
const MAINSTREAM_STRIP_RULES = new Set<DeltaRuleId>([
  "headline_vs_median",
  "headline_only_peer",
  "topic_only_peer",
  "open_staff_comments",
  "only_peer_open_staff",
  "disagreement_reported",
  "contingency_open_emphasis",
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
  "Biggest number moves and material one-time disclosures — not every footnote difference.";

export function isMainstreamStripFlag(flag: DeltaFlag): boolean {
  if (flag.metadata?.rollupCount != null) return false;
  if (flag.ruleId === "metrics_not_comparable_mixed_filers") return false;
  if (!MAINSTREAM_STRIP_RULES.has(flag.ruleId)) return false;

  if (flag.ruleId === "topic_only_peer") {
    return MAINSTREAM_TOPIC_SECTIONS.has(flag.sectionId);
  }

  if (flag.ruleId === "contingency_open_emphasis") {
    return flag.severity !== "P3";
  }

  return true;
}

export function filterMainstreamStripFlags(flags: DeltaFlag[]): DeltaFlag[] {
  return flags.filter(isMainstreamStripFlag);
}

/** Rank material movers/events for the headline strip (default cap 5). */
export function rankMainstreamStrip(flags: DeltaFlag[], cap = 5): DeltaFlag[] {
  return rankDeltas(filterMainstreamStripFlags(flags), { preset: "general", cap });
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
