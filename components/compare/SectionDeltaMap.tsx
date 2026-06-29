"use client";

import { useMemo, useState, type ReactNode } from "react";
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
  deltaRuleBadgeWithIcon,
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
  P1: "border-amber-200 bg-amber-50 text-amber-900",
  P2: "border-brand-200 bg-brand-50 text-brand-900",
  P3: "border-slate-200 bg-slate-50 text-slate-700",
};

function formatSectionRowLabel(label: string): string {
  return label.replace(/^Item \d+[A-Z]? — /, "").replace(/^Note — /, "");
}

function cellHasSection(col: FilingColumn | undefined, sectionId: string): boolean {
  return col?.sections.some((s) => s.id === sectionId) ?? false;
}

function severityTone(severity: DeltaSeverity): string {
  return SEVERITY_CELL_TONE[severity];
}

function TooltipContent({ heading, lines }: { heading: string; lines: string[] }) {
  return (
    <div className="space-y-1">
      <p className="font-medium text-slate-800">{heading}</p>
      {lines.map((line) => (
        <p key={line} className={line.startsWith("e.g.") ? "text-slate-400 italic" : "text-slate-600"}>
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
            className="pointer-events-none fixed z-[200] w-max max-w-[280px] -translate-x-1/2 -translate-y-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left text-[11px] leading-snug text-slate-700 shadow-lg"
            style={{ left: anchor.left + anchor.width / 2, top: anchor.top - 6 }}
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
      <p className="font-medium text-slate-600">What the badges mean</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {DELTA_MAP_BADGE_CONFIG.map((entry) => (
          <div key={entry.ruleId} className="flex min-w-0 gap-2">
            <span
              className={`shrink-0 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium ${severityTone(entry.severity)}`}
            >
              {entry.icon} {entry.badgeLabel}
            </span>
            <div className="min-w-0 leading-snug">
              <p className="text-slate-600">{entry.subtitle}</p>
              <p className="text-slate-400 italic">e.g. {entry.example}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="border-t border-slate-100 pt-1.5 leading-snug text-slate-500">
        <span className="font-medium text-slate-600">{DELTA_MAP_ALIGNED_LABEL}</span>
        {" — "}
        section matches peers, no material difference
        <span className="mx-1.5 text-slate-300">·</span>
        <span className="font-medium text-slate-500">{DELTA_MAP_NOT_FILED_LABEL}</span>
        {" — "}
        section absent from this peer&apos;s report
        <span className="mx-1.5 text-slate-300">·</span>
        minor footnote wording differences are not shown
      </p>
    </div>
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

  if (sectionRows.length === 0) return null;

  const coverageText = `Scanned ${scannedCount} section${scannedCount === 1 ? "" : "s"} · ${sectionsWithDeltas} with delta${sectionsWithDeltas === 1 ? "" : "s"}`;

  return (
    <section
      className={`relative shrink-0 border-b border-slate-200 ${expanded ? "z-40 bg-white" : "bg-slate-50/60"}`}
      aria-label="Section delta map"
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-slate-50/80"
        aria-expanded={expanded}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Delta map
        </span>
        <span className="text-xs text-slate-500">{coverageText}</span>
        <span className="ml-auto text-xs font-medium text-brand-700">
          {expanded ? "Collapse" : "Expand grid"}
        </span>
        <span
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500"
          aria-hidden
        >
          {expanded ? "−" : "+"}
        </span>
      </button>

      {expanded && (
        <div className="delta-map-overlay absolute inset-x-0 top-full border-b border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-2">
            <DeltaMapLegend />
          </div>
          <div className="delta-map-overlay-scroll px-4 py-2">
            <table className="w-full min-w-[520px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="sticky left-0 z-10 bg-white py-1.5 pr-3 font-semibold">Section</th>
                  {tickers.map((ticker) => (
                    <th key={ticker} className="px-2 py-1.5 font-mono font-semibold">
                      {ticker}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sectionRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                    <td className="sticky left-0 z-10 max-w-[180px] truncate bg-white py-1.5 pr-3 font-medium text-slate-700">
                      {formatSectionRowLabel(row.label)}
                    </td>
                    {tickers.map((ticker) => {
                      const col = columnByTicker.get(ticker);
                      const present = cellHasSection(col, row.id);
                      const cellFlags = row.flags.filter((f) => f.ticker === ticker);
                      const topFlag = cellFlags.sort((a, b) => {
                        const order = { P1: 0, P2: 1, P3: 2 };
                        return order[a.severity] - order[b.severity];
                      })[0];
                      const tooltip = cellFlagsTooltip(cellFlags);

                      if (!present && cellFlags.some((f) => f.ruleId === "missing_section")) {
                        const missingTip = cellFlagsTooltip(cellFlags);
                        return (
                          <td key={ticker} className="px-2 py-1.5">
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
                                className="whitespace-nowrap rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-amber-100"
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
                          <td key={ticker} className="px-2 py-1.5">
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
                                className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium hover:opacity-90 ${severityTone(topFlag.severity)}`}
                              >
                                {badgeLabel}
                              </button>
                            </DeltaMapTooltip>
                          </td>
                        );
                      }

                      return (
                        <td key={ticker} className="px-2 py-1.5 text-center">
                          <DeltaMapTooltip
                            tip={
                              <TooltipContent
                                heading={present ? DELTA_MAP_ALIGNED_LABEL : DELTA_MAP_NOT_FILED_LABEL}
                                lines={[present ? DELTA_MAP_ALIGNED_TOOLTIP : DELTA_MAP_NOT_FILED_TOOLTIP]}
                              />
                            }
                          >
                            <span
                              className={`inline-block rounded px-1 py-0.5 text-[10px] ${
                                present ? "text-slate-400" : "text-slate-300"
                              }`}
                            >
                              {present ? DELTA_MAP_ALIGNED_LABEL : DELTA_MAP_NOT_FILED_LABEL}
                            </span>
                          </DeltaMapTooltip>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-4 py-1.5 text-[11px] text-slate-500">
            {coverageText}
          </div>
        </div>
      )}
    </section>
  );
}
