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
  return `Only ${ticker} has ${sectionLabel}`;
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
