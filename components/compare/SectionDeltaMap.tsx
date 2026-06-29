"use client";

import { useMemo, useState } from "react";
import type { FilingColumn } from "@/lib/api";
import type { DeltaFlag } from "@/lib/delta-types";
import { flagsForSection } from "@/lib/delta-engine";
import { deltaRuleShortLabel } from "@/lib/delta-labels";

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

function formatSectionRowLabel(label: string): string {
  return label.replace(/^Item \d+[A-Z]? — /, "").replace(/^Note — /, "");
}

function cellHasSection(col: FilingColumn | undefined, sectionId: string): boolean {
  return col?.sections.some((s) => s.id === sectionId) ?? false;
}

function cellTooltip(cellFlags: DeltaFlag[]): string {
  if (cellFlags.length === 0) return "";
  if (cellFlags.length === 1) return cellFlags[0].label;
  return cellFlags.map((f) => f.label).join("\n");
}

function DeltaMapLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
      <span>
        <span className="font-medium text-amber-900">Missing</span>
        <span className="text-slate-400"> — </span>
        peer lacks a section others have
      </span>
      <span className="hidden sm:inline text-slate-300">|</span>
      <span>
        <span className="font-medium text-brand-900">Delta</span>
        <span className="text-slate-400"> — </span>
        change detected in that section
      </span>
      <span className="hidden md:inline text-slate-300">|</span>
      <span className="hidden md:inline text-slate-400">· no delta · — not in filing</span>
      <span className="hidden lg:inline text-slate-300">|</span>
      <span className="hidden lg:inline text-slate-400">
        narrative-only footnotes (P3) omitted
      </span>
    </p>
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

  const summaryText = `${sectionsWithDeltas} section${sectionsWithDeltas === 1 ? "" : "s"} with deltas`;

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
        <span className="text-xs text-slate-500">{summaryText}</span>
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
          <div className="border-b border-slate-100 px-4 py-1.5">
            <DeltaMapLegend />
          </div>
          <div className="delta-map-overlay-scroll px-4 py-2">
            <table className="w-full min-w-[480px] border-collapse text-xs">
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

                      if (!present && cellFlags.some((f) => f.ruleId === "missing_section")) {
                        return (
                          <td key={ticker} className="px-2 py-1.5">
                            <button
                              type="button"
                              onClick={() => onCellClick(ticker, row.id, topFlag)}
                              className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-amber-100"
                              title={cellTooltip(cellFlags)}
                            >
                              Missing
                            </button>
                          </td>
                        );
                      }

                      if (topFlag) {
                        const tone =
                          topFlag.severity === "P1"
                            ? "border-amber-200 bg-amber-50 text-amber-900"
                            : topFlag.severity === "P2"
                              ? "border-brand-200 bg-brand-50 text-brand-900"
                              : "border-slate-200 bg-slate-50 text-slate-700";
                        const badgeLabel =
                          cellFlags.length > 1
                            ? `${cellFlags.length} deltas`
                            : deltaRuleShortLabel(topFlag.ruleId);
                        return (
                          <td key={ticker} className="px-2 py-1.5">
                            <button
                              type="button"
                              onClick={() => onCellClick(ticker, row.id, topFlag)}
                              className={`max-w-[120px] truncate rounded border px-1.5 py-0.5 text-[10px] font-medium hover:opacity-90 ${tone}`}
                              title={cellTooltip(cellFlags)}
                            >
                              {badgeLabel}
                            </button>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={ticker}
                          className="px-2 py-1.5 text-center text-slate-300"
                          title={present ? "No delta in this section" : "Section not in filing"}
                        >
                          {present ? "·" : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
