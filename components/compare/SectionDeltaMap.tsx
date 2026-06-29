"use client";

import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { FilingColumn } from "@/lib/api";
import type { DeltaFlag, DeltaSeverity } from "@/lib/delta-types";
import { flagsForSection } from "@/lib/delta-engine";
import {
  cellFlagsTooltip,
  DELTA_MAP_ALIGNED_LABEL,
  DELTA_MAP_ALIGNED_TOOLTIP,
  DELTA_MAP_BADGE_CONFIG,
  DELTA_MAP_NOT_FILED_LABEL,
  DELTA_MAP_NOT_FILED_TOOLTIP,
  deltaMapHeadline,
  deltaMapInsightTeaser,
  deltaMapRowSummary,
  deltaRuleBadgeWithIcon,
  formatSectionRowLabel,
  sectionGroupLabel,
} from "@/lib/delta-labels";

interface SectionDeltaMapProps {
  tickers: string[];
  catalog: { id: string; label: string }[];
  columns: FilingColumn[];
  flags: DeltaFlag[];
  scannedCount: number;
  sectionsWithDeltas: number;
  onCellClick: (ticker: string, sectionId: string, flag?: DeltaFlag) => void;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

const SEVERITY_CELL_TONE: Record<DeltaSeverity, string> = {
  P1: "border-amber-300/80 bg-amber-50 text-amber-950 shadow-sm shadow-amber-100/50",
  P2: "border-brand-300/70 bg-brand-50 text-brand-900 shadow-sm shadow-brand-100/40",
  P3: "border-slate-200 bg-slate-50 text-slate-700",
};

const SEVERITY_ORDER: Record<DeltaSeverity, number> = { P1: 0, P2: 1, P3: 2 };

function cellHasSection(col: FilingColumn | undefined, sectionId: string): boolean {
  return col?.sections.some((s) => s.id === sectionId) ?? false;
}

function severityTone(severity: DeltaSeverity): string {
  return SEVERITY_CELL_TONE[severity];
}

function topFlagForCell(cellFlags: DeltaFlag[]): DeltaFlag | undefined {
  return [...cellFlags].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])[0];
}

function rowHeatTone(flags: DeltaFlag[]): string {
  if (flags.some((f) => f.severity === "P1")) {
    return "border-l-[3px] border-l-amber-500 bg-gradient-to-r from-amber-50/50 to-transparent";
  }
  if (flags.some((f) => f.severity === "P2")) {
    return "border-l-[3px] border-l-brand-500 bg-gradient-to-r from-brand-50/40 to-transparent";
  }
  return "border-l border-l-slate-200";
}

function TooltipContent({ heading, lines }: { heading: string; lines: string[] }) {
  return (
    <div className="space-y-1">
      <p className="font-medium text-slate-800">{heading}</p>
      {lines.map((line) => (
        <p key={line} className={line.startsWith("e.g.") ? "italic text-slate-400" : "text-slate-600"}>
          {line}
        </p>
      ))}
    </div>
  );
}

function DeltaMapTooltip({ tip, children }: { tip: ReactNode; children: ReactNode }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const show = (target: EventTarget & HTMLElement) => setAnchor(target.getBoundingClientRect());
  const hide = () => setAnchor(null);

  return (
    <span
      className="inline-flex"
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={hide}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={hide}
    >
      {children}
      {anchor &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[200] w-max max-w-[300px] -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[11px] leading-snug text-slate-700 shadow-xl"
            style={{ left: anchor.left + anchor.width / 2, top: anchor.top - 8 }}
          >
            {tip}
          </div>,
          document.body,
        )}
    </span>
  );
}

function DeltaMapLegend() {
  return (
    <div className="space-y-2 text-[11px]">
      <p className="font-medium text-slate-700">What each cell means</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {DELTA_MAP_BADGE_CONFIG.map((entry) => (
          <div key={entry.ruleId} className="flex min-w-0 gap-2 rounded-md border border-slate-100 bg-slate-50/50 px-2 py-1.5">
            <span
              className={`shrink-0 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold ${severityTone(entry.severity)}`}
            >
              {entry.icon} {entry.badgeLabel}
            </span>
            <div className="min-w-0 leading-snug">
              <p className="text-slate-600">{entry.subtitle}</p>
              <p className="italic text-slate-400">e.g. {entry.example}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="border-t border-slate-100 pt-1.5 leading-snug text-slate-500">
        <span className="inline-flex items-center gap-1 font-medium text-brand-700">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />
          {DELTA_MAP_ALIGNED_LABEL}
        </span>
        {" — "}
        section matches peers
        <span className="mx-1.5 text-slate-300">·</span>
        <span className="font-medium text-slate-500">{DELTA_MAP_NOT_FILED_LABEL}</span>
        {" — "}
        absent from this filing
        <span className="mx-1.5 text-slate-300">·</span>
        minor footnote wording not shown
      </p>
    </div>
  );
}

function AlignedCell() {
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 ring-1 ring-brand-200/80"
      aria-label={DELTA_MAP_ALIGNED_LABEL}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />
    </span>
  );
}

function NotFiledCell() {
  return (
    <span
      className="inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded border border-dashed border-slate-200 bg-slate-50 text-[10px] font-medium text-slate-400"
      aria-label={DELTA_MAP_NOT_FILED_LABEL}
    >
      —
    </span>
  );
}

export default function SectionDeltaMap({
  tickers,
  catalog,
  columns,
  flags,
  scannedCount,
  sectionsWithDeltas,
  onCellClick,
  defaultExpanded = false,
  expanded: expandedProp,
  onExpandedChange,
}: SectionDeltaMapProps) {
  const [expandedInternal, setExpandedInternal] = useState(defaultExpanded);
  const expanded = expandedProp ?? expandedInternal;
  const setExpanded = onExpandedChange ?? setExpandedInternal;
  const sectionRef = useRef<HTMLElement>(null);
  const [panelTop, setPanelTop] = useState(0);

  useLayoutEffect(() => {
    if (!expanded) return;

    const syncPanelTop = () => {
      const bottom = sectionRef.current?.getBoundingClientRect().bottom;
      if (bottom != null) setPanelTop(bottom);
    };

    syncPanelTop();
    window.addEventListener("resize", syncPanelTop);
    window.addEventListener("scroll", syncPanelTop, true);
    return () => {
      window.removeEventListener("resize", syncPanelTop);
      window.removeEventListener("scroll", syncPanelTop, true);
    };
  }, [expanded]);

  const columnByTicker = useMemo(() => {
    const map = new Map<string, FilingColumn>();
    for (const col of columns) map.set(col.ticker, col);
    return map;
  }, [columns]);

  const sectionRows = useMemo(() => {
    return catalog
      .map((entry) => {
        const sectionFlags = flagsForSection(flags, entry.id);
        if (sectionFlags.length === 0) return null;
        return { ...entry, flags: sectionFlags };
      })
      .filter((row): row is { id: string; label: string; flags: DeltaFlag[] } => row != null);
  }, [catalog, flags]);

  const groupedSections = useMemo(() => {
    const groups = new Map<string, typeof sectionRows>();
    for (const row of sectionRows) {
      const key = sectionGroupLabel(row.label);
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [sectionRows]);

  const headline = deltaMapHeadline(flags.length, sectionsWithDeltas);
  const insightTeaser = useMemo(() => deltaMapInsightTeaser(flags), [flags]);

  if (sectionRows.length === 0) return null;

  const coverageText = `Scanned ${scannedCount} section${scannedCount === 1 ? "" : "s"} across ${tickers.length} peers`;

  const cellButtonClass =
    "whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1";

  const expandedPanel = expanded ? (
    <div
      className="delta-map-panel"
      style={{ top: panelTop, ["--delta-map-panel-top" as string]: `${panelTop}px` }}
      role="dialog"
      aria-label="Section delta map grid"
    >
      <div className="sticky top-0 z-30 shrink-0 border-b border-slate-100 bg-white px-4 py-2.5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">{headline}</p>
          <p className="text-[11px] text-slate-500">{coverageText}</p>
        </div>
        <DeltaMapLegend />
      </div>

      <div className="delta-map-overlay-scroll min-h-0 flex-1 px-4 py-2">
        <table className="w-full min-w-[520px] border-collapse text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="sticky left-0 z-20 bg-white py-2 pr-3 font-semibold">Section</th>
              {tickers.map((ticker) => (
                <th key={ticker} className="px-2 py-2 text-center font-mono font-semibold">
                  {ticker}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedSections.map(([groupLabel, rows]) => {
              const groupFlagCount = rows.reduce((n, r) => n + r.flags.length, 0);
              return (
                <Fragment key={groupLabel}>
                  <tr className="bg-slate-50/90">
                    <td
                      colSpan={tickers.length + 1}
                      className="sticky left-0 z-10 border-y border-slate-100 px-0 py-1.5 pl-1"
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                        {groupLabel}
                      </span>
                      <span className="ml-2 text-[10px] font-normal normal-case text-slate-400">
                        {rows.length} section{rows.length === 1 ? "" : "s"} · {groupFlagCount} difference
                        {groupFlagCount === 1 ? "" : "s"}
                      </span>
                    </td>
                  </tr>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-b border-slate-100/80 transition-colors hover:bg-slate-50/60 ${rowHeatTone(row.flags)}`}
                    >
                      <td className="sticky left-0 z-10 max-w-[200px] bg-white py-2 pr-3">
                        <p className="truncate font-semibold text-slate-800">
                          {formatSectionRowLabel(row.label)}
                        </p>
                        <p className="truncate text-[10px] text-slate-500">
                          {deltaMapRowSummary(row.label, row.flags)}
                        </p>
                      </td>
                      {tickers.map((ticker) => {
                        const col = columnByTicker.get(ticker);
                        const present = cellHasSection(col, row.id);
                        const cellFlags = row.flags.filter((f) => f.ticker === ticker);
                        const topFlag = topFlagForCell(cellFlags);
                        const tooltip = cellFlagsTooltip(cellFlags);

                        if (!present && cellFlags.some((f) => f.ruleId === "missing_section")) {
                          const missingTip = cellFlagsTooltip(cellFlags);
                          return (
                            <td key={ticker} className="px-2 py-2 text-center">
                              <DeltaMapTooltip
                                tip={
                                  missingTip ? (
                                    <TooltipContent heading={missingTip.heading} lines={missingTip.lines} />
                                  ) : null
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() => onCellClick(ticker, row.id, topFlag)}
                                  className={`${cellButtonClass} border-amber-300/80 bg-amber-50 text-amber-950 shadow-sm shadow-amber-100/50`}
                                >
                                  ∅ Missing
                                </button>
                              </DeltaMapTooltip>
                            </td>
                          );
                        }

                        if (topFlag) {
                          const badgeLabel =
                            cellFlags.length > 1
                              ? `${cellFlags.length} differences`
                              : deltaRuleBadgeWithIcon(topFlag.ruleId);
                          return (
                            <td key={ticker} className="px-2 py-2 text-center">
                              <DeltaMapTooltip
                                tip={
                                  tooltip ? (
                                    <TooltipContent heading={tooltip.heading} lines={tooltip.lines} />
                                  ) : null
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() => onCellClick(ticker, row.id, topFlag)}
                                  className={`${cellButtonClass} ${severityTone(topFlag.severity)}`}
                                >
                                  {badgeLabel}
                                </button>
                              </DeltaMapTooltip>
                            </td>
                          );
                        }

                        return (
                          <td key={ticker} className="px-2 py-2 text-center">
                            <DeltaMapTooltip
                              tip={
                                <TooltipContent
                                  heading={present ? DELTA_MAP_ALIGNED_LABEL : DELTA_MAP_NOT_FILED_LABEL}
                                  lines={[present ? DELTA_MAP_ALIGNED_TOOLTIP : DELTA_MAP_NOT_FILED_TOOLTIP]}
                                />
                              }
                            >
                              {present ? <AlignedCell /> : <NotFiledCell />}
                            </DeltaMapTooltip>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="shrink-0 border-t border-slate-100 bg-slate-50/50 px-4 py-2 text-[11px] text-slate-600">
        <span className="font-medium text-slate-700">{headline}</span>
        <span className="text-slate-400"> · </span>
        {coverageText}
        <span className="text-slate-400"> · Click any badge to jump to that disclosure</span>
      </div>
    </div>
  ) : null;

  return (
    <>
      {expanded &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <button
              type="button"
              className="delta-map-backdrop"
              aria-label="Close delta map"
              onClick={() => setExpanded(false)}
            />
            {expandedPanel}
          </>,
          document.body,
        )}

      <section
        ref={sectionRef}
        className="relative shrink-0 border-b border-slate-200"
        aria-label="Section delta map"
      >
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`group flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors sm:flex-row sm:items-center sm:gap-3 ${
            expanded
              ? "relative z-[45] border-b border-slate-100 bg-white"
              : "border-l-4 border-l-brand-600 bg-gradient-to-r from-brand-50/80 via-white to-slate-50/40 hover:from-brand-50 delta-map-trigger-pulse"
          }`}
          aria-expanded={expanded}
        >
          <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white shadow-md shadow-brand-600/25"
              aria-hidden
            >
              {flags.length}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-700">
                Section delta map
              </p>
              <p className="truncate text-sm font-semibold text-slate-900">{headline}</p>
              {!expanded && insightTeaser && (
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{insightTeaser}</p>
              )}
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-2 self-end sm:self-center">
            <span className="text-xs font-medium text-brand-700 group-hover:text-brand-800">
              {expanded ? "Collapse" : "Explore grid"}
            </span>
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white font-mono text-xs text-slate-600 shadow-sm transition group-hover:border-brand-200 group-hover:text-brand-700"
              aria-hidden
            >
              {expanded ? "−" : "+"}
            </span>
          </span>
        </button>
      </section>
    </>
  );
}
