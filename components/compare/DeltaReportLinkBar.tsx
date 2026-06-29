"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DeltaCountBadge from "@/components/compare/DeltaCountBadge";
import {
  DELTA_MAP_HEADLINE_SCANNING,
  deltaMapHeadline,
  deltaMapInsightTeaser,
} from "@/lib/delta-labels";
import type { ComparePeriod } from "@/lib/filing-period";
import { deltaReportPath } from "@/lib/delta-report";
import type { DeltaFlag } from "@/lib/delta-types";

interface DeltaReportLinkBarProps {
  peerSlug: string;
  tickers: string[];
  period: ComparePeriod;
  flags: DeltaFlag[];
  scannedCount: number;
  sectionsWithDeltas: number;
  /** True while parse, financials, or note upgrades are still in flight. */
  settling?: boolean;
}

export default function DeltaReportLinkBar({
  peerSlug,
  tickers,
  period,
  flags,
  scannedCount,
  sectionsWithDeltas,
  settling = false,
}: DeltaReportLinkBarProps) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (settling) {
      setRevealed(false);
      return;
    }
    const timer = window.setTimeout(() => setRevealed(true), 300);
    return () => window.clearTimeout(timer);
  }, [settling, flags.length, sectionsWithDeltas]);

  const spinning = settling || !revealed;
  const headline = spinning
    ? DELTA_MAP_HEADLINE_SCANNING
    : deltaMapHeadline(flags.length, sectionsWithDeltas);
  const insightTeaser = spinning ? null : deltaMapInsightTeaser(flags);
  const reportHref = deltaReportPath(peerSlug, period);
  const hasFlags = !spinning && flags.length > 0;

  return (
    <section
      className={`relative shrink-0 border-b border-slate-200 border-l-4 bg-gradient-to-r via-white to-slate-50/40 ${
        hasFlags
          ? "border-l-brand-600 from-brand-50/80"
          : "border-l-slate-300 from-slate-50/80"
      }`}
      aria-label="Section delta map summary"
    >
      <div className="flex w-full flex-col gap-1.5 px-4 py-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:items-center">
          <DeltaCountBadge count={flags.length} spinning={spinning} hasFlags={flags.length > 0} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-700">
              Section delta map
            </p>
            <p className="truncate text-sm font-semibold text-slate-900">{headline}</p>
            {insightTeaser && (
              <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{insightTeaser}</p>
            )}
            <p className="mt-0.5 text-[11px] text-slate-500">
              {spinning
                ? "Scanning sections for differences…"
                : `Scanned ${scannedCount} section${scannedCount === 1 ? "" : "s"} across ${tickers.length} peers`}
            </p>
          </div>
        </div>
        <Link
          href={reportHref}
          className="inline-flex shrink-0 items-center justify-center self-end rounded-md border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 sm:self-center"
        >
          Open delta report
        </Link>
      </div>
    </section>
  );
}
