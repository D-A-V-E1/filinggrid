import type { DeltaFlag, DeltaRuleId, DeltaSeverity } from "@/lib/delta-types";

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
  example: string;
  severity: DeltaSeverity;
}

/** Every badge type that can appear on the section delta map. */
export const DELTA_MAP_BADGE_CONFIG: DeltaMapBadgeConfig[] = [
  {
    ruleId: "missing_section",
    badgeLabel: "Missing",
    icon: "∅",
    subtitle: "Peer omits a section others include",
    example: "MSFT has no Item 1B while AAPL and GOOGL do",
    severity: "P1",
  },
  {
    ruleId: "headline_vs_median",
    badgeLabel: "Metric outlier",
    icon: "↕",
    subtitle: "Well above or below peer median",
    example: "MSFT revenue is 60% above the peer median",
    severity: "P1",
  },
  {
    ruleId: "headline_only_peer",
    badgeLabel: "Sole outlier",
    icon: "◎",
    subtitle: "Only this peer differs on a headline metric",
    example: "Only META shows negative net income in the group",
    severity: "P1",
  },
  {
    ruleId: "topic_only_peer",
    badgeLabel: "Only here",
    icon: "★",
    subtitle: "Disclosure topic appears in one peer only",
    example: "Only AMZN includes a cyber-risk footnote in this group",
    severity: "P2",
  },
  {
    ruleId: "open_staff_comments",
    badgeLabel: "SEC comments",
    icon: "✉",
    subtitle: "Unresolved SEC staff comments disclosed",
    example: "NVDA — open SEC comment letters still outstanding",
    severity: "P1",
  },
  {
    ruleId: "only_peer_open_staff",
    badgeLabel: "SEC comments",
    icon: "✉",
    subtitle: "Only peer with open SEC staff comments",
    example: "Only TSLA has unresolved staff comments in this group",
    severity: "P1",
  },
  {
    ruleId: "disagreement_reported",
    badgeLabel: "Disagreement",
    icon: "⚑",
    subtitle: "Accountant disagreement disclosed",
    example: "XYZ — former auditor disagreement noted in Item 9",
    severity: "P1",
  },
  {
    ruleId: "contingency_open_emphasis",
    badgeLabel: "Legal focus",
    icon: "§",
    subtitle: "Heavier litigation or contingency language vs peers",
    example: "AAPL — unusually detailed loss-contingency discussion",
    severity: "P2",
  },
  {
    ruleId: "prose_number_gap",
    badgeLabel: "No amounts",
    icon: "¶",
    subtitle: "Narrative disclosure without tagged dollar amounts",
    example: "GOOGL — revenue note has prose only, no XBRL line items",
    severity: "P3",
  },
  {
    ruleId: "metrics_not_comparable_mixed_filers",
    badgeLabel: "Mixed filers",
    icon: "⊘",
    subtitle: "US and foreign filers — headline metrics not comparable",
    example: "10-K peers mixed with 20-F filers in this group",
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

/** @deprecated Use DELTA_MAP_BADGE_CONFIG — kept for imports that expect a string. */
export const DELTA_MAP_BADGE_LEGEND = DELTA_MAP_BADGE_CONFIG.map((e) => e.badgeLabel).join(" · ");

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
      lines: [flag.label, config?.example ? `e.g. ${config.example}` : ""].filter(Boolean),
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
  "Section matches peers — no material difference in this filing";

export const DELTA_MAP_NOT_FILED_LABEL = "Not filed";
export const DELTA_MAP_NOT_FILED_TOOLTIP = "Section absent from this peer's report";

export function formatSectionRowLabel(label: string): string {
  return label.replace(/^Item \d+[A-Z]? — /, "").replace(/^Note — /, "");
}

export function sectionGroupLabel(catalogLabel: string): string {
  if (catalogLabel.startsWith("Note —")) return "Footnotes";
  const itemMatch = catalogLabel.match(/^Item (\d+[A-Z]?)/);
  if (itemMatch) return `Item ${itemMatch[1]}`;
  return "Disclosures";
}

/** Marketing headline for collapsed delta map trigger. */
export function deltaMapHeadline(flagCount: number, sectionsWithDeltas: number): string {
  if (flagCount === 0) return "No material differences in this peer group";
  const diffs = `${flagCount} material difference${flagCount === 1 ? "" : "s"}`;
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

/** One-line teaser for collapsed map — highest-severity flag label. */
export function deltaMapInsightTeaser(flags: DeltaFlag[]): string | null {
  if (flags.length === 0) return null;
  const order = { P1: 0, P2: 1, P3: 2 };
  const top = [...flags].sort((a, b) => order[a.severity] - order[b.severity])[0];
  return top?.label ?? null;
}
