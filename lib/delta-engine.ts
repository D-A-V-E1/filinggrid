import type { FilingColumn, FinancialsXbrl, NoteSectionXbrl } from "@/lib/api";
import { formFromPeriodId } from "@/lib/filing-period";
import { GAAP_STATEMENT_SECTION_IDS, getCatalogOrder } from "@/lib/sections";
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

/** Dollar-event footnotes — require non-zero tagged FY amounts, not narrative alone. */
const DOLLAR_EVENT_NOTE_SECTIONS = [
  "note-impairment",
  "note-contingencies",
  "note-restructuring",
  "note-acquisitions",
] as const;

/** Governance / open-matter sections — substantive preview is sufficient. */
const GOVERNANCE_TOPIC_SECTIONS = [
  "unresolved-staff",
  "controls",
  "disagreements",
] as const;

const DOLLAR_EVENT_NOTE_SECTION_SET = new Set<string>(DOLLAR_EVENT_NOTE_SECTIONS);
const GOVERNANCE_TOPIC_SECTION_SET = new Set<string>(GOVERNANCE_TOPIC_SECTIONS);

const TOPIC_PRESENCE_SECTIONS = [
  "legal-proceedings",
  ...DOLLAR_EVENT_NOTE_SECTIONS,
  ...GOVERNANCE_TOPIC_SECTIONS,
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

function parseInterimSlot(period?: string): { fy: number; fp: string } | null {
  const match = period?.match(/^interim-(\d{4})-(Q[1-4])/i);
  if (!match) return null;
  return { fy: parseInt(match[1], 10), fp: match[2].toUpperCase() };
}

/** Headline metrics for the active compare period — quarterly for 10-Q, annual FY otherwise. */
function headlineMetricsForPeriod(
  fin: FinancialsXbrl | undefined,
  fiscalYear: number | null,
  period?: string
): Record<string, number> | null {
  if (!fin) return null;
  const interim = parseInterimSlot(period);

  if (interim && fin.metrics) {
    const out: Record<string, number> = {};
    for (const key of HEADLINE_METRICS) {
      const quarterly = fin.metrics[key]?.quarterly;
      if (!quarterly?.length) continue;
      const match =
        quarterly.find((q) => q.fy === interim.fy && q.fp === interim.fp) ??
        quarterly.find((q) => q.fy === interim.fy);
      const val = match?.value;
      if (typeof val === "number" && Number.isFinite(val)) out[key] = val;
    }
    if (Object.keys(out).length > 0) return out;
  }

  if (!fin.annual_summary?.length) return null;
  const targetFy = interim?.fy ?? fiscalYear;
  const row =
    targetFy != null
      ? fin.annual_summary.find((r) => r.fy === targetFy)
      : fin.annual_summary[0];
  if (!row) return null;
  if (interim && row.fy !== interim.fy) return null;

  const out: Record<string, number> = {};
  for (const key of HEADLINE_METRICS) {
    const val = row[key];
    if (typeof val === "number" && Number.isFinite(val)) out[key] = val;
  }
  return Object.keys(out).length > 0 ? out : null;
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

function pickNoteFyRow(
  note: NoteSectionXbrl,
  fiscalYear: number | null
): Record<string, number | string | undefined> | null {
  if (!note.annual_summary?.length) return null;
  if (fiscalYear != null) {
    return note.annual_summary.find((r) => r.fy === fiscalYear) ?? null;
  }
  return [...note.annual_summary].sort((a, b) => b.fy - a.fy)[0] ?? null;
}

/** Non-zero tagged amounts for the active FY — not mere tag presence or historical zeros. */
function hasNonZeroNoteMetricsForFy(note: NoteSectionXbrl, fiscalYear: number | null): boolean {
  const row = pickNoteFyRow(note, fiscalYear);
  if (!row) return false;
  for (const key of Object.keys(note.metrics)) {
    const val = row[key];
    if (typeof val === "number" && Number.isFinite(val) && val !== 0) return true;
  }
  return false;
}

function isDollarEventNoteSection(sectionId: string): boolean {
  return DOLLAR_EVENT_NOTE_SECTION_SET.has(sectionId);
}

/** Material topic signal for strip eligibility — not catalog section presence alone. */
function columnHasTopicPresenceSignal(
  col: FilingColumn,
  sectionId: string,
  state: DeltaSessionState
): boolean {
  if (isDollarEventNoteSection(sectionId)) {
    const note = state.financialsByTicker[col.ticker]?.notes_xbrl?.[sectionId];
    if (!note) return false;
    return hasNonZeroNoteMetricsForFy(note, state.fiscalYear);
  }

  if (GOVERNANCE_TOPIC_SECTION_SET.has(sectionId)) {
    return isSubstantivePreview(sectionPreview(col, sectionId));
  }

  return isSubstantivePreview(sectionPreview(col, sectionId));
}

function columnEligibleForContingencyEmphasis(
  col: FilingColumn,
  sectionId: string,
  state: DeltaSessionState
): boolean {
  if (sectionId !== "note-contingencies") return true;
  const note = state.financialsByTicker[col.ticker]?.notes_xbrl?.[sectionId];
  if (!note) return false;
  return hasNonZeroNoteMetricsForFy(note, state.fiscalYear);
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
    if (GAAP_STATEMENT_SECTION_IDS.has(sectionId)) continue;

    const peersWith = state.columns.filter((c) => columnHasSection(c, sectionId));
    // Single-peer presence is topic_only_peer territory — not a catalog gap.
    if (peersWith.length < 2) continue;

    const peersWithout = state.columns.filter((c) => !columnHasSection(c, sectionId));
    if (peersWithout.length === 0) continue;
    // Only flag when the missing peer(s) are a minority vs peers who have the section.
    if (peersWithout.length >= peersWith.length) continue;

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
    const withSection = state.columns.filter(
      (c) => columnHasSection(c, sectionId) && columnHasTopicPresenceSignal(c, sectionId, state)
    );
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
    const summary = headlineMetricsForPeriod(
      state.financialsByTicker[ticker],
      state.fiscalYear,
      state.period
    );
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
      const summary = headlineMetricsForPeriod(
        state.financialsByTicker[t],
        state.fiscalYear,
        state.period
      );
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
      if (!columnEligibleForContingencyEmphasis(col, sectionId, state)) continue;
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

/** Specific governance rules that subsume topic_only_peer on the same ticker+section. */
const TOPIC_ONLY_PEER_GOVERNANCE_OVERRIDES: Record<string, DeltaFlag["ruleId"][]> = {
  disagreements: ["disagreement_reported"],
  "unresolved-staff": ["open_staff_comments", "only_peer_open_staff"],
};

function dedupeTopicOnlyPeerGovernanceOverlaps(flags: DeltaFlag[]): void {
  const overridden = new Set<string>();
  for (const flag of flags) {
    const overrides = TOPIC_ONLY_PEER_GOVERNANCE_OVERRIDES[flag.sectionId];
    if (!overrides?.includes(flag.ruleId)) continue;
    overridden.add(`${flag.ticker}:${flag.sectionId}`);
  }
  if (overridden.size === 0) return;

  for (let i = flags.length - 1; i >= 0; i--) {
    const flag = flags[i];
    if (flag.ruleId !== "topic_only_peer") continue;
    if (overridden.has(`${flag.ticker}:${flag.sectionId}`)) flags.splice(i, 1);
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
  dedupeTopicOnlyPeerGovernanceOverlaps(flags);
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
