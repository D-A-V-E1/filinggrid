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

/** Short badge text for delta-map grid cells (tooltip carries full label). */
export function deltaRuleShortLabel(ruleId: string): string {
  switch (ruleId) {
    case "missing_section":
      return "Missing";
    case "headline_vs_median":
      return "Metric";
    case "headline_only_peer":
      return "Outlier";
    case "topic_only_peer":
      return "Unique";
    case "open_staff_comments":
    case "only_peer_open_staff":
      return "Staff";
    case "disagreement_reported":
      return "Auditor";
    case "contingency_open_emphasis":
      return "Legal";
    case "prose_number_gap":
      return "Narrative";
    case "metrics_not_comparable_mixed_filers":
      return "Mixed";
    default:
      return "Delta";
  }
}
