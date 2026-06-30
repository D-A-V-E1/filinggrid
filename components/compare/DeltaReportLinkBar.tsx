"use client";

import Link from "next/link";
import DeltaCountBadge from "@/components/compare/DeltaCountBadge";
import { DeltaScanningTitle } from "@/components/compare/DeltaScanningAffordance";
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
  /** Monotonic count floor from session store — survives remounts. */
  countFloor?: number;
  /** Resets badge monotonic state when compare inputs change. */
  resetKey?: string;
}

export default function DeltaReportLinkBar({
  peerSlug,
  tickers,
  period,
  flags,
  scannedCount,
  sectionsWithDeltas,
  settling = false,
  countFloor = 0,
  resetKey,
}: DeltaReportLinkBarProps) {
  const displayFlagCount = settling
    ? Math.max(flags.length, countFloor)
    : flags.length;
  const headline = settling
    ? DELTA_MAP_HEADLINE_SCANNING
    : deltaMapHeadline(displayFlagCount, sectionsWithDeltas);
  const insightTeaser = settling ? null : deltaMapInsightTeaser(flags);
  const reportHref = deltaReportPath(peerSlug, period);
  const hasFlags = flags.length > 0 || countFloor > 0;

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
          <DeltaCountBadge
            count={flags.length}
            loading={settling}
            hasFlags={hasFlags}
            countFloor={countFloor}
            resetKey={resetKey}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-700">
              Section delta map
            </p>
            <p className="truncate text-sm font-semibold text-slate-900">
              <DeltaScanningTitle scanning={settling}>{headline}</DeltaScanningTitle>
            </p>
            {insightTeaser && (
              <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{insightTeaser}</p>
            )}
            <p className="mt-0.5 text-[11px] text-slate-500">
              {settling
                ? "Scanning sections for differences…"
                : `Scanned ${scannedCount} section${scannedCount === 1 ? "" : "s"} across ${tickers.length} peers`}
            </p>
          </div>
        </div>
        <Link
          href={reportHref}
          className="inline-flex shrink-0 items-center justify-center self-end rounded-md border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 sm:self-center"
        >
          View delta report
        </Link>
      </div>
    </section>
  );
}
