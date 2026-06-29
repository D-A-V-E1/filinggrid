import type { DeltaFlag, DeltaRuleId, DeltaSeverity } from "@/lib/delta-types";

const METRIC_FOCUS_RULE_IDS = new Set<DeltaRuleId>(["headline_vs_median", "headline_only_peer"]);

/** Delta flags that should center the filing column on a highlighted metric row. */
export function isMetricFocusDeltaFlag(flag: DeltaFlag): boolean {
  return Boolean(flag.rowKey) && METRIC_FOCUS_RULE_IDS.has(flag.ruleId);
}
import { rankMainstreamStrip } from "@/lib/delta-surface";

const METRIC_LABELS: Record<string, string> = {
  revenue: "Revenue",
  net_income: "Net income",
  operating_income: "Operating income",
  eps_diluted: "EPS (diluted)",
};

export function metricLabel(key: string): string {
  return METRIC_LABELS[key] ?? key.replace(/_/g, " ");
}

export function headlineVsMedianLabel(ticker: string, metricKey: string, direction: "high" | "low"): string {
  const metric = metricLabel(metricKey);
  if (direction === "high") {
    return `${ticker} ${metric.toLowerCase()} well above peer median`;
  }
  return `${ticker} ${metric.toLowerCase()} well below peer median`;
}

export function headlineOnlyPeerLabel(ticker: string, metricKey: string): string {
  if (metricKey === "net_income") {
    return `Only ${ticker} negative net income in group`;
  }
  if (metricKey === "eps_diluted") {
    return `Only ${ticker} negative EPS in group`;
  }
  return `Only ${ticker} outlier on ${metricLabel(metricKey).toLowerCase()}`;
}

export function missingSectionLabel(ticker: string, sectionLabel: string): string {
  return `${ticker} missing ${sectionLabel} — peers have it`;
}

export function topicOnlyPeerLabel(ticker: string, sectionLabel: string): string {
  return `Only ${ticker} includes ${sectionLabel.toLowerCase()} note`;
}

export function openStaffCommentsLabel(ticker: string): string {
  return `${ticker} — unresolved SEC staff comments disclosed`;
}

export function onlyPeerOpenStaffLabel(ticker: string): string {
  return `Only ${ticker} has open staff comments in group`;
}

export function disagreementReportedLabel(ticker: string): string {
  return `${ticker} — accountant disagreement disclosed`;
}

export function contingencyEmphasisLabel(ticker: string, sectionLabel: string): string {
  return `${ticker} — heavy ${sectionLabel.toLowerCase()} language vs peers`;
}

export const MIXED_FILER_BANNER =
  "This group mixes US and foreign filers — financial metric comparisons are limited.";

export const METRICS_NOT_COMPARABLE_LABEL =
  "US and foreign filers in group — metric comparisons limited";

export interface DeltaMapBadgeConfig {
  ruleId: DeltaRuleId;
  badgeLabel: string;
  icon: string;
  subtitle: string;
  severity: DeltaSeverity;
}

/** Every badge type that can appear on the section delta map. */
export const DELTA_MAP_BADGE_CONFIG: DeltaMapBadgeConfig[] = [
  {
    ruleId: "missing_section",
    badgeLabel: "Missing",
    icon: "∅",
    subtitle: "Peer omits a section others include",
    severity: "P1",
  },
  {
    ruleId: "headline_vs_median",
    badgeLabel: "Metric outlier",
    icon: "↕",
    subtitle: "Well above or below peer median",
    severity: "P1",
  },
  {
    ruleId: "headline_only_peer",
    badgeLabel: "Sole outlier",
    icon: "◎",
    subtitle: "Only this peer differs on a headline metric",
    severity: "P1",
  },
  {
    ruleId: "topic_only_peer",
    badgeLabel: "Only here",
    icon: "★",
    subtitle: "Disclosure topic appears in one peer only",
    severity: "P2",
  },
  {
    ruleId: "open_staff_comments",
    badgeLabel: "SEC comments",
    icon: "✉",
    subtitle: "Unresolved SEC staff comments disclosed",
    severity: "P1",
  },
  {
    ruleId: "only_peer_open_staff",
    badgeLabel: "SEC comments",
    icon: "✉",
    subtitle: "Only peer with open SEC staff comments",
    severity: "P1",
  },
  {
    ruleId: "disagreement_reported",
    badgeLabel: "Disagreement",
    icon: "⚑",
    subtitle: "Accountant disagreement disclosed",
    severity: "P1",
  },
  {
    ruleId: "contingency_open_emphasis",
    badgeLabel: "Legal focus",
    icon: "§",
    subtitle: "Heavier litigation or contingency language vs peers",
    severity: "P2",
  },
  {
    ruleId: "prose_number_gap",
    badgeLabel: "No amounts",
    icon: "¶",
    subtitle: "Narrative disclosure without tagged dollar amounts",
    severity: "P3",
  },
  {
    ruleId: "metrics_not_comparable_mixed_filers",
    badgeLabel: "Mixed filers",
    icon: "⊘",
    subtitle: "US and foreign filers — headline metrics not comparable",
    severity: "P2",
  },
];

const BADGE_BY_RULE = new Map(DELTA_MAP_BADGE_CONFIG.map((entry) => [entry.ruleId, entry]));

export function deltaMapBadgeConfig(ruleId: string): DeltaMapBadgeConfig | undefined {
  return BADGE_BY_RULE.get(ruleId as DeltaRuleId);
}

/** Short badge text for delta-map grid cells. */
export function deltaRuleShortLabel(ruleId: string): string {
  return deltaMapBadgeConfig(ruleId)?.badgeLabel ?? "Difference";
}

export function deltaRuleBadgeIcon(ruleId: string): string {
  return deltaMapBadgeConfig(ruleId)?.icon ?? "•";
}

export function deltaRuleBadgeWithIcon(ruleId: string): string {
  const config = deltaMapBadgeConfig(ruleId);
  if (!config) return "Difference";
  return `${config.icon} ${config.badgeLabel}`;
}

export interface CellFlagsTooltip {
  heading: string;
  lines: string[];
}

/** Plain-English tooltip for one or more flags in a map cell. */
export function cellFlagsTooltip(flags: DeltaFlag[]): CellFlagsTooltip | null {
  if (flags.length === 0) return null;

  if (flags.length === 1) {
    const flag = flags[0];
    const config = deltaMapBadgeConfig(flag.ruleId);
    return {
      heading: config?.subtitle ?? "Difference vs peers",
      lines: flag.label ? [flag.label] : [],
    };
  }

  const sorted = [...flags].sort((a, b) => {
    const order = { P1: 0, P2: 1, P3: 2 };
    return order[a.severity] - order[b.severity];
  });

  return {
    heading: `${flags.length} differences in this section`,
    lines: sorted.map((flag) => {
      const label = deltaRuleShortLabel(flag.ruleId);
      return `${label}: ${flag.label}`;
    }),
  };
}

export const DELTA_MAP_ALIGNED_LABEL = "Aligned";
export const DELTA_MAP_ALIGNED_TOOLTIP =
  "Section matches peers — no key difference in this filing";

export const DELTA_MAP_NOT_FILED_LABEL = "Not filed";
export const DELTA_MAP_NOT_FILED_TOOLTIP = "Section absent from this peer's report";

export const DELTA_MAP_NOT_INDEXED_LABEL = "Not indexed";
export const DELTA_MAP_NOT_INDEXED_TOOLTIP =
  "Filing sections could not be indexed (common on 6-K cover pages before exhibit load)";

export function formatSectionRowLabel(label: string): string {
  return label.replace(/^Item \d+[A-Z]? — /, "").replace(/^Note — /, "");
}

export function sectionGroupLabel(catalogLabel: string): string {
  if (catalogLabel.startsWith("Note —")) return "Footnotes";
  const itemMatch = catalogLabel.match(/^Item (\d+[A-Z]?)/);
  if (itemMatch) return `Item ${itemMatch[1]}`;
  return "Disclosures";
}

export const DELTA_MAP_HEADLINE_SCANNING = "Scanning for key differences…";

/** Marketing headline for collapsed delta map trigger. */
export function deltaMapHeadline(flagCount: number, sectionsWithDeltas: number): string {
  if (flagCount === 0) return "No key differences in this peer group";
  const diffs = `${flagCount} key difference${flagCount === 1 ? "" : "s"}`;
  const sections = `${sectionsWithDeltas} section${sectionsWithDeltas === 1 ? "" : "s"}`;
  return `${diffs} across ${sections}`;
}

/** Row-level insight shown beside section name. */
export function deltaMapRowSummary(catalogLabel: string, flags: { ticker: string }[]): string {
  const peerCount = new Set(flags.map((f) => f.ticker)).size;
  const short = formatSectionRowLabel(catalogLabel).toLowerCase();
  if (peerCount <= 1) return `1 peer differs on ${short}`;
  return `${peerCount} peers differ on ${short}`;
}

/** One-line teaser for collapsed map — top mainstream-ranked insight (matches strip priority). */
export function deltaMapInsightTeaser(flags: DeltaFlag[]): string | null {
  return rankMainstreamStrip(flags, 1)[0]?.label ?? null;
}
