import type { FilingColumn, FinancialsXbrl } from "@/lib/api";
import { formFromPeriodId } from "@/lib/filing-period";
import { getCatalogOrder } from "@/lib/sections";
import {
  contingencyEmphasisLabel,
  disagreementReportedLabel,
  headlineOnlyPeerLabel,
  headlineVsMedianLabel,
  METRICS_NOT_COMPARABLE_LABEL,
  missingSectionLabel,
  MIXED_FILER_BANNER,
  onlyPeerOpenStaffLabel,
  openStaffCommentsLabel,
  topicOnlyPeerLabel,
} from "@/lib/delta-labels";
import type { DeltaFlag, DeltaScanResult, DeltaSessionState } from "@/lib/delta-types";

const HEADLINE_METRICS = ["revenue", "net_income", "operating_income", "eps_diluted"] as const;

const TOPIC_PRESENCE_SECTIONS = [
  "legal-proceedings",
  "note-impairment",
  "note-contingencies",
] as const;

const CONTINGENCY_SECTIONS = ["legal-proceedings", "note-contingencies"] as const;

const CONTINGENCY_KEYWORDS = [
  "reasonably possible",
  "loss contingency",
  "under investigation",
  "unable to estimate",
  "material loss",
];

const NONE_PATTERNS = /^(none\.?|not applicable\.?|n\/a\.?|no unresolved|there are no|not required)/i;

function flagId(ruleId: string, ticker: string, sectionId: string, suffix = ""): string {
  return `${ruleId}:${ticker}:${sectionId}${suffix ? `:${suffix}` : ""}`;
}

function resolveForm(col: FilingColumn, period?: string): string | null {
  return col.form ?? formFromPeriodId(period);
}

function isDomesticForm(form: string | null): boolean {
  if (!form) return true;
  const base = form.replace(/\/A$/i, "").toUpperCase();
  return base === "10-K" || base === "10-Q";
}

function isForeignForm(form: string | null): boolean {
  if (!form) return false;
  const base = form.replace(/\/A$/i, "").toUpperCase();
  return base === "20-F" || base === "6-K";
}

function detectMixedFilers(columns: FilingColumn[], period?: string): {
  mixedDomesticForeign: boolean;
  banner: string | null;
} {
  let hasDomestic = false;
  let hasForeign = false;
  for (const col of columns) {
    const form = resolveForm(col, period);
    if (isDomesticForm(form)) hasDomestic = true;
    if (isForeignForm(form)) hasForeign = true;
  }
  const mixedDomesticForeign = hasDomestic && hasForeign;
  return {
    mixedDomesticForeign,
    banner: mixedDomesticForeign ? MIXED_FILER_BANNER : null,
  };
}

function isHtmlSourced(fin?: FinancialsXbrl): boolean {
  return fin?.source === "sec_html_filing";
}

function metricsComparable(columns: FilingColumn[], financialsByTicker: Record<string, FinancialsXbrl>, period?: string): boolean {
  const { mixedDomesticForeign } = detectMixedFilers(columns, period);
  if (mixedDomesticForeign) return false;

  const sources = new Set<string>();
  for (const col of columns) {
    const fin = financialsByTicker[col.ticker];
    if (fin?.source) sources.add(fin.source);
  }
  const sourceList = Array.from(sources);
  const hasHtml = sourceList.some((s) => s === "sec_html_filing");
  const hasFacts = sourceList.some((s) => s === "sec_companyfacts" || s === "sec_ixbrl_filing");
  if (hasHtml && hasFacts) return false;

  return true;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fySummary(fin: FinancialsXbrl | undefined, fiscalYear: number | null): Record<string, number> | null {
  if (!fin?.annual_summary?.length) return null;
  const row =
    fiscalYear != null
      ? fin.annual_summary.find((r) => r.fy === fiscalYear) ?? fin.annual_summary[0]
      : fin.annual_summary[0];
  if (!row) return null;
  const out: Record<string, number> = {};
  for (const key of HEADLINE_METRICS) {
    const val = row[key];
    if (typeof val === "number" && Number.isFinite(val)) out[key] = val;
  }
  return out;
}

function sectionLabel(catalog: { id: string; label: string }[], sectionId: string): string {
  const found = catalog.find((s) => s.id === sectionId);
  if (!found) return sectionId.replace(/-/g, " ");
  return found.label.replace(/^Item \d+[A-Z]? — /, "").replace(/^Note — /, "");
}

function columnHasSection(col: FilingColumn, sectionId: string): boolean {
  return col.sections.some((s) => s.id === sectionId);
}

function sectionPreview(col: FilingColumn, sectionId: string): string {
  return col.sections.find((s) => s.id === sectionId)?.text_preview?.trim() ?? "";
}

function isSubstantivePreview(text: string, minLen = 40): boolean {
  const trimmed = text.trim();
  if (trimmed.length < minLen) return false;
  if (NONE_PATTERNS.test(trimmed)) return false;
  return true;
}

function keywordHits(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw)).length;
}

function pushFlag(flags: DeltaFlag[], flag: DeltaFlag): void {
  flags.push(flag);
}

function scanMissingSections(
  state: DeltaSessionState,
  flags: DeltaFlag[],
  catalogOrder: string[]
): void {
  const labelById = new Map(state.catalog.map((s) => [s.id, s.label]));
  for (const sectionId of catalogOrder) {
    const peersWith = state.columns.filter((c) => columnHasSection(c, sectionId));
    if (peersWith.length === 0) continue;
    const peersWithout = state.columns.filter((c) => !columnHasSection(c, sectionId));
    if (peersWithout.length === 0) continue;

    const label = sectionLabel(state.catalog, sectionId);
    for (const col of peersWithout) {
      pushFlag(flags, {
        id: flagId("missing_section", col.ticker, sectionId),
        ruleId: "missing_section",
        level: "L1",
        severity: peersWith.length >= state.columns.length - 1 ? "P1" : "P2",
        ticker: col.ticker,
        sectionId,
        label: missingSectionLabel(col.ticker, label),
        metadata: { sectionLabel: labelById.get(sectionId) ?? label },
      });
    }
  }
}

function scanTopicPresence(state: DeltaSessionState, flags: DeltaFlag[]): void {
  for (const sectionId of TOPIC_PRESENCE_SECTIONS) {
    const withSection = state.columns.filter((c) => columnHasSection(c, sectionId));
    if (withSection.length === 0 || withSection.length === state.columns.length) continue;

    const label = sectionLabel(state.catalog, sectionId);
    if (withSection.length === 1) {
      const col = withSection[0];
      pushFlag(flags, {
        id: flagId("topic_only_peer", col.ticker, sectionId),
        ruleId: "topic_only_peer",
        level: "L1",
        severity: "P2",
        ticker: col.ticker,
        sectionId,
        label: topicOnlyPeerLabel(col.ticker, label),
      });
    }
  }
}

function scanHeadlineMetrics(state: DeltaSessionState, flags: DeltaFlag[], comparable: boolean): void {
  if (!comparable) return;

  const valuesByMetric: Record<string, Record<string, number>> = {};
  for (const ticker of state.tickers) {
    const summary = fySummary(state.financialsByTicker[ticker], state.fiscalYear);
    if (!summary) continue;
    for (const metric of HEADLINE_METRICS) {
      const val = summary[metric];
      if (val == null) continue;
      valuesByMetric[metric] ??= {};
      valuesByMetric[metric][ticker] = val;
    }
  }

  for (const metric of HEADLINE_METRICS) {
    const byTicker = valuesByMetric[metric];
    if (!byTicker) continue;
    const tickers = Object.keys(byTicker);
    if (tickers.length < 2) continue;

    const values = Object.values(byTicker);
    const med = median(values);
    if (med == null || med === 0) continue;

    for (const [ticker, value] of Object.entries(byTicker)) {
      if (value > med * 1.5) {
        pushFlag(flags, {
          id: flagId("headline_vs_median", ticker, "financial-statements", metric),
          ruleId: "headline_vs_median",
          level: "L0",
          severity: "P2",
          ticker,
          sectionId: "financial-statements",
          rowKey: metric,
          label: headlineVsMedianLabel(ticker, metric, "high"),
          metadata: { metric, value, median: med },
        });
      } else if (value < med * 0.5 && value !== med) {
        pushFlag(flags, {
          id: flagId("headline_vs_median", ticker, "financial-statements", metric),
          ruleId: "headline_vs_median",
          level: "L0",
          severity: "P2",
          ticker,
          sectionId: "financial-statements",
          rowKey: metric,
          label: headlineVsMedianLabel(ticker, metric, "low"),
          metadata: { metric, value, median: med },
        });
      }
    }
  }

  for (const metric of ["net_income", "eps_diluted"] as const) {
    const negatives = state.tickers.filter((t) => {
      const summary = fySummary(state.financialsByTicker[t], state.fiscalYear);
      const val = summary?.[metric];
      return val != null && val < 0;
    });
    if (negatives.length !== 1) continue;
    const ticker = negatives[0];
    pushFlag(flags, {
      id: flagId("headline_only_peer", ticker, "financial-statements", metric),
      ruleId: "headline_only_peer",
      level: "L0",
      severity: "P1",
      ticker,
      sectionId: "financial-statements",
      rowKey: metric,
      label: headlineOnlyPeerLabel(ticker, metric),
    });
  }
}

function scanOpenMattersMetadata(state: DeltaSessionState, flags: DeltaFlag[]): void {
  const staffOpen: FilingColumn[] = [];
  for (const col of state.columns) {
    if (!columnHasSection(col, "unresolved-staff")) continue;
    const preview = sectionPreview(col, "unresolved-staff");
    if (isSubstantivePreview(preview)) {
      staffOpen.push(col);
      pushFlag(flags, {
        id: flagId("open_staff_comments", col.ticker, "unresolved-staff"),
        ruleId: "open_staff_comments",
        level: "L1",
        severity: "P1",
        ticker: col.ticker,
        sectionId: "unresolved-staff",
        label: openStaffCommentsLabel(col.ticker),
      });
    }
  }

  if (staffOpen.length === 1 && state.columns.length > 1) {
    const col = staffOpen[0];
    pushFlag(flags, {
      id: flagId("only_peer_open_staff", col.ticker, "unresolved-staff"),
      ruleId: "only_peer_open_staff",
      level: "L0",
      severity: "P1",
      ticker: col.ticker,
      sectionId: "unresolved-staff",
      label: onlyPeerOpenStaffLabel(col.ticker),
    });
  }

  for (const col of state.columns) {
    if (!columnHasSection(col, "disagreements")) continue;
    const preview = sectionPreview(col, "disagreements");
    if (isSubstantivePreview(preview, 30)) {
      pushFlag(flags, {
        id: flagId("disagreement_reported", col.ticker, "disagreements"),
        ruleId: "disagreement_reported",
        level: "L1",
        severity: "P1",
        ticker: col.ticker,
        sectionId: "disagreements",
        label: disagreementReportedLabel(col.ticker),
      });
    }
  }
}

function scanContingencyEmphasis(state: DeltaSessionState, flags: DeltaFlag[]): void {
  for (const sectionId of CONTINGENCY_SECTIONS) {
    const hitsByTicker: Record<string, number> = {};
    for (const col of state.columns) {
      if (!columnHasSection(col, sectionId)) continue;
      const preview = sectionPreview(col, sectionId);
      const hits = keywordHits(preview, CONTINGENCY_KEYWORDS);
      if (hits > 0) hitsByTicker[col.ticker] = hits;
    }
    const tickers = Object.keys(hitsByTicker);
    if (tickers.length < 2) continue;
    const counts = Object.values(hitsByTicker);
    const med = median(counts);
    if (med == null) continue;

    const label = sectionLabel(state.catalog, sectionId);
    for (const [ticker, hits] of Object.entries(hitsByTicker)) {
      if (hits >= Math.max(2, med * 2)) {
        pushFlag(flags, {
          id: flagId("contingency_open_emphasis", ticker, sectionId),
          ruleId: "contingency_open_emphasis",
          level: "L1",
          severity: "P2",
          ticker,
          sectionId,
          label: contingencyEmphasisLabel(ticker, label),
          metadata: { hits, median: med },
        });
      }
    }
  }
}

function scanProseNumberGap(state: DeltaSessionState, flags: DeltaFlag[]): void {
  for (const col of state.columns) {
    const fin = state.financialsByTicker[col.ticker];
    if (!fin?.notes_xbrl) continue;
    for (const section of col.sections) {
      if (!section.id.startsWith("note-")) continue;
      const note = fin.notes_xbrl[section.id];
      if (note?.has_data) continue;
      pushFlag(flags, {
        id: flagId("prose_number_gap", col.ticker, section.id),
        ruleId: "prose_number_gap",
        level: "L1",
        severity: "P3",
        ticker: col.ticker,
        sectionId: section.id,
        label: `${col.ticker} — ${sectionLabel(state.catalog, section.id)} has narrative only (no tagged amounts)`,
      });
    }
  }
}

function promoteL0Rollups(flags: DeltaFlag[]): void {
  const byTicker = new Map<string, number>();
  for (const flag of flags) {
    if (flag.level === "L1" && flag.severity !== "P3") {
      byTicker.set(flag.ticker, (byTicker.get(flag.ticker) ?? 0) + 1);
    }
  }
  for (const [ticker, count] of Array.from(byTicker.entries())) {
    if (count < 3) continue;
    pushFlag(flags, {
      id: flagId("column_heat", ticker, "financial-statements"),
      ruleId: "topic_only_peer",
      level: "L0",
      severity: "P3",
      ticker,
      sectionId: "financial-statements",
      label: `${ticker} — ${count} disclosure deltas vs peers`,
      metadata: { rollupCount: count },
    });
  }
}

/** Phase 1 metadata scan — L0 strip + L1 map flags from parse + headline financials. */
export function scanDeltas(state: DeltaSessionState): DeltaScanResult {
  const flags: DeltaFlag[] = [];
  const catalogOrder = getCatalogOrder(state.isPro);
  const { banner } = detectMixedFilers(state.columns, state.period);
  const comparable = metricsComparable(state.columns, state.financialsByTicker, state.period);

  if (!comparable && state.columns.length >= 2) {
    pushFlag(flags, {
      id: "metrics_not_comparable_mixed_filers:group",
      ruleId: "metrics_not_comparable_mixed_filers",
      level: "L0",
      severity: "P3",
      ticker: state.tickers[0] ?? "",
      sectionId: "financial-statements",
      label: METRICS_NOT_COMPARABLE_LABEL,
    });
  }

  scanMissingSections(state, flags, catalogOrder);
  scanTopicPresence(state, flags);
  scanHeadlineMetrics(state, flags, comparable);
  scanOpenMattersMetadata(state, flags);
  scanContingencyEmphasis(state, flags);
  scanProseNumberGap(state, flags);
  promoteL0Rollups(flags);

  const sectionsWithDeltas = new Set(flags.map((f) => f.sectionId)).size;
  const columnHeat: Record<string, number> = {};
  for (const flag of flags) {
    columnHeat[flag.ticker] = (columnHeat[flag.ticker] ?? 0) + 1;
  }

  return {
    flags,
    columnHeat,
    mixedFilerBanner: banner,
    coverage: {
      scannedSections: state.catalog.length,
      sectionsWithDeltas,
    },
  };
}

export function flagsForSection(flags: DeltaFlag[], sectionId: string): DeltaFlag[] {
  return flags.filter((f) => f.sectionId === sectionId);
}

export function foreignFilerTooltip(form: string | null): string | null {
  if (!form) return null;
  const base = form.replace(/\/A$/i, "").toUpperCase();
  if (base === "20-F") return "Foreign filer (20-F) — metrics may not be comparable with US peers.";
  if (base === "6-K") return "Interim 6-K — figures may be from earnings release, not full quarterly report.";
  return null;
}

export { isHtmlSourced };
