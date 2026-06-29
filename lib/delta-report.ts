import type { FilingColumn, FinancialsXbrl } from "@/lib/api";
import type { DeltaFlag } from "@/lib/delta-types";
import { flagsForSection } from "@/lib/delta-engine";
import { columnHasSectionPresence, columnHasSparseSectionIndex } from "@/lib/section-presence";
import {
  DELTA_MAP_ALIGNED_LABEL,
  DELTA_MAP_NOT_FILED_LABEL,
  DELTA_MAP_NOT_INDEXED_LABEL,
  deltaRuleBadgeWithIcon,
  formatSectionRowLabel,
} from "@/lib/delta-labels";
import { buildCompareSearchParams, type ComparePeriod } from "@/lib/filing-period";

export interface DeltaReportSnapshot {
  peerSlug: string;
  tickers: string[];
  periodId: string;
  periodLabel: string;
  generatedAt: string;
  scannedSections: number;
  sectionsWithDeltas: number;
  flagCount: number;
  flags: DeltaFlag[];
  catalog: { id: string; label: string }[];
  columns: FilingColumn[];
  financialsByTicker?: Record<string, FinancialsXbrl>;
}

export function deltaReportPath(slug: string, period: ComparePeriod): string {
  const params = buildCompareSearchParams(period);
  const query = params.toString();
  return query ? `/compare/${slug}/deltas?${query}` : `/compare/${slug}/deltas`;
}

export function compareFocusPath(
  slug: string,
  period: ComparePeriod,
  focus: { section: string; ticker: string; row?: string }
): string {
  const params = buildCompareSearchParams(period);
  params.set("section", focus.section);
  params.set("ticker", focus.ticker);
  if (focus.row) params.set("row", focus.row);
  return `/compare/${slug}?${params.toString()}`;
}

export function comparePath(slug: string, period: ComparePeriod): string {
  const params = buildCompareSearchParams(period);
  const query = params.toString();
  return query ? `/compare/${slug}?${query}` : `/compare/${slug}`;
}

export function buildDeltaReportSnapshot(input: {
  peerSlug: string;
  tickers: string[];
  period: ComparePeriod;
  periodLabel: string;
  flags: DeltaFlag[];
  scannedSections: number;
  sectionsWithDeltas: number;
  catalog: { id: string; label: string }[];
  columns: FilingColumn[];
  financialsByTicker?: Record<string, FinancialsXbrl>;
  generatedAt?: string;
}): DeltaReportSnapshot {
  const periodId =
    input.period.period ??
    (input.period.fiscalYear != null ? `annual-${input.period.fiscalYear}` : "latest");

  return {
    peerSlug: input.peerSlug,
    tickers: input.tickers,
    periodId,
    periodLabel: input.periodLabel,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    scannedSections: input.scannedSections,
    sectionsWithDeltas: input.sectionsWithDeltas,
    flagCount: input.flags.length,
    flags: input.flags,
    catalog: input.catalog,
    columns: input.columns,
    financialsByTicker: input.financialsByTicker,
  };
}

function cellLabel(
  ticker: string,
  sectionId: string,
  flags: DeltaFlag[],
  col: FilingColumn | undefined,
  financialsByTicker?: Record<string, FinancialsXbrl>
): string {
  const present =
    col != null && columnHasSectionPresence(col, sectionId, financialsByTicker?.[col.ticker]);
  const sparseIndex = col != null && columnHasSparseSectionIndex(col);
  const cellFlags = flags.filter((f) => f.ticker === ticker);

  if (!present && sparseIndex) return DELTA_MAP_NOT_INDEXED_LABEL;
  if (!present && cellFlags.some((f) => f.ruleId === "missing_section")) return "Missing";
  if (cellFlags.length > 1) return `${cellFlags.length} differences`;
  if (cellFlags.length === 1) return deltaRuleBadgeWithIcon(cellFlags[0].ruleId);
  return present ? DELTA_MAP_ALIGNED_LABEL : DELTA_MAP_NOT_FILED_LABEL;
}

export function deltaReportToCsv(snapshot: DeltaReportSnapshot): string {
  const columnByTicker = new Map(snapshot.columns.map((c) => [c.ticker, c]));
  const sectionRows = snapshot.catalog
    .map((entry) => {
      const sectionFlags = flagsForSection(snapshot.flags, entry.id);
      if (sectionFlags.length === 0) return null;
      return { ...entry, flags: sectionFlags };
    })
    .filter((row): row is { id: string; label: string; flags: DeltaFlag[] } => row != null);

  const header = ["Section", ...snapshot.tickers].map(escapeCsv).join(",");
  const rows = sectionRows.map((row) => {
    const cells = snapshot.tickers.map((ticker) =>
      cellLabel(ticker, row.id, row.flags, columnByTicker.get(ticker), snapshot.financialsByTicker)
    );
    return [formatSectionRowLabel(row.label), ...cells].map(escapeCsv).join(",");
  });

  const meta = [
    `# Delta report: ${snapshot.tickers.join(" · ")}`,
    `# Period: ${snapshot.periodLabel}`,
    `# Generated: ${snapshot.generatedAt}`,
    `# Scanned ${snapshot.scannedSections} sections · ${snapshot.flagCount} differences across ${snapshot.sectionsWithDeltas} sections`,
    "",
  ];

  return [...meta, header, ...rows].join("\n");
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function downloadDeltaReportCsv(snapshot: DeltaReportSnapshot, filename?: string): void {
  const csv = deltaReportToCsv(snapshot);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    filename ??
    `delta-report-${snapshot.tickers.join("-").toLowerCase()}-${snapshot.periodId}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
