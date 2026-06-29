"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DELTA_MAP_HEADLINE_SCANNING,
  deltaMapHeadline,
  deltaMapInsightTeaser,
} from "@/lib/delta-labels";
import {
  buildDeltaReportSnapshot,
  compareFocusPath,
  comparePath,
  downloadDeltaReportCsv,
} from "@/lib/delta-report";
import type { DeltaFlag } from "@/lib/delta-types";
import { useComparePeriodLabel } from "@/hooks/useComparePeriodLabel";
import { useCompareSession } from "@/hooks/useCompareSession";
import { apiUnreachableHint, isLocalDevHost } from "@/lib/api-environment";
import ApiHealthBanner from "../ApiHealthBanner";
import PaywallModal from "../billing/PaywallModal";
import DeltaCountBadge from "./DeltaCountBadge";
import { DeltaScanningTitle } from "./DeltaScanningAffordance";
import SectionDeltaMapGrid from "./SectionDeltaMapGrid";

interface CompareDeltaReportProps {
  peerSlug: string;
  tickers: string[];
  fiscalYear?: number;
  period?: string;
  slugError?: string | null;
}

export default function CompareDeltaReport({
  peerSlug,
  tickers,
  fiscalYear,
  period,
  slugError,
}: CompareDeltaReportProps) {
  const router = useRouter();
  const session = useCompareSession({ tickers, fiscalYear, period, slugError });
  const periodLabel = useComparePeriodLabel(tickers, session.comparePeriod);
  const [generatedAt] = useState(() => new Date().toISOString());

  const snapshot = useMemo(() => {
    if (!session.data || session.mapFlags.length === 0) return null;
    return buildDeltaReportSnapshot({
      peerSlug,
      tickers,
      period: session.comparePeriod,
      periodLabel,
      flags: session.mapFlags,
      scannedSections: session.deltaScan?.coverage.scannedSections ?? 0,
      sectionsWithDeltas: session.mapCoverage.sectionsWithDeltas,
      catalog: session.navigableCatalog,
      columns: session.data.columns,
      financialsByTicker: session.financialsByTicker,
      generatedAt,
    });
  }, [
    peerSlug,
    tickers,
    session.comparePeriod,
    periodLabel,
    session.mapFlags,
    session.deltaScan,
    session.mapCoverage,
    session.navigableCatalog,
    session.data,
    session.financialsByTicker,
    generatedAt,
  ]);

  const headline =
    session.deltasSettling && session.mapFlags.length === 0
      ? DELTA_MAP_HEADLINE_SCANNING
      : deltaMapHeadline(session.mapFlags.length, session.mapCoverage.sectionsWithDeltas);
  const insightTeaser = session.deltasSettling ? null : deltaMapInsightTeaser(session.mapFlags);
  const scannedCount = session.deltaScan?.coverage.scannedSections ?? 0;
  const compareHref = comparePath(peerSlug, session.comparePeriod);

  const handleCellClick = useCallback(
    (ticker: string, sectionId: string, flag?: DeltaFlag) => {
      router.push(
        compareFocusPath(peerSlug, session.comparePeriod, {
          section: sectionId,
          ticker,
          row: flag?.rowKey,
        })
      );
    },
    [router, peerSlug, session.comparePeriod]
  );

  const handleDownload = useCallback(() => {
    if (!snapshot) return;
    downloadDeltaReportCsv(snapshot);
  }, [snapshot]);

  if (slugError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-sm font-medium text-slate-800">Invalid comparison URL</p>
        <p className="mt-2 max-w-md text-sm text-slate-600">{slugError}</p>
        <Link href="/" className="mt-4 text-sm font-medium text-brand-700 hover:text-brand-800">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <ApiHealthBanner healthy={session.apiHealthy} warming={!session.apiWarmupDone} />

      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <DeltaCountBadge
              count={session.mapFlags.length}
              loading={session.deltasSettling}
              hasFlags={session.mapFlags.length > 0}
            />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-700">
                Delta report
              </p>
              <h1 className="text-lg font-semibold text-slate-900">
                <DeltaScanningTitle scanning={session.deltasSettling}>{headline}</DeltaScanningTitle>
              </h1>
              {insightTeaser && (
                <p className="line-clamp-1 text-xs text-slate-500">{insightTeaser}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                <span>
                  <span className="font-medium text-slate-500">Peers</span>{" "}
                  <span className="font-mono font-semibold text-slate-800">{tickers.join(" · ")}</span>
                </span>
                <span>
                  <span className="font-medium text-slate-500">Period</span>{" "}
                  <span className="font-semibold text-slate-800">{periodLabel}</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {session.deltasSettling
                  ? "Scanning sections for differences…"
                  : `Scanned ${scannedCount} section${scannedCount === 1 ? "" : "s"} across ${tickers.length} peers`}
                <span className="text-slate-400"> · </span>
                Generated {new Date(generatedAt).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href={compareHref}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
            >
              Back to compare
            </Link>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!snapshot}
              className="rounded-md border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 shadow-sm transition hover:border-brand-300 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download CSV
            </button>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {session.authLoading && tickers.length > 3 && !session.data && (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-sm text-slate-500">Loading subscription…</p>
          </div>
        )}

        {!session.data && !session.error && !session.columnLimitExceeded && !(session.authLoading && tickers.length > 3) && (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-sm text-slate-500">
              {!session.apiWarmupDone ? "Connecting to filing API…" : "Loading delta report…"}
            </p>
          </div>
        )}

        {session.columnLimitExceeded && (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-sm text-slate-600">Too many tickers for your plan.</p>
          </div>
        )}

        {session.error && !session.data && !session.columnLimitExceeded && (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-md text-center">
              <p className="text-sm font-medium text-red-700">Could not load filings</p>
              <p className="mt-2 text-sm text-red-600">{session.error}</p>
              {session.apiHealthy === false && (
                <p className="mt-3 text-xs text-slate-500">
                  {isLocalDevHost() ? (
                    <>
                      The API at port 8000 is not responding. Run{" "}
                      <code className="font-mono">start.bat</code> and try again.
                    </>
                  ) : (
                    apiUnreachableHint()
                  )}
                </p>
              )}
            </div>
          </div>
        )}

        {session.canShowCompare &&
          session.deltasSettling &&
          session.mapFlags.length === 0 && (
            <div className="flex flex-1 items-center justify-center p-8">
              <p className="text-sm text-slate-500">Scanning sections for differences…</p>
            </div>
          )}

        {session.canShowCompare &&
          !session.deltasSettling &&
          session.mapFlags.length === 0 && (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="max-w-md text-center">
              <p className="text-sm font-medium text-slate-700">No section deltas to report</p>
              <p className="mt-2 text-xs text-slate-500">
                Peers appear aligned across scanned sections for this period.
              </p>
              <Link
                href={compareHref}
                className="mt-4 inline-block text-sm font-medium text-brand-700 hover:text-brand-800"
              >
                Back to compare
              </Link>
            </div>
          </div>
        )}

        {session.canShowCompare && session.mapFlags.length > 0 && (
          <>
            {session.sectionsParseError && (
              <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                {session.sectionsParseError}
              </div>
            )}
            <SectionDeltaMapGrid
              tickers={tickers}
              catalog={session.navigableCatalog}
              columns={session.data?.columns ?? []}
              financialsByTicker={session.financialsByTicker}
              flags={session.mapFlags}
              onCellClick={handleCellClick}
            />
            <footer className="shrink-0 border-t border-slate-100 bg-slate-50/50 px-4 py-2 text-[11px] text-slate-600">
              <span className="font-medium text-slate-700">
                <DeltaScanningTitle scanning={session.deltasSettling}>{headline}</DeltaScanningTitle>
              </span>
              <span className="text-slate-400"> · </span>
              Click any badge to jump to that disclosure in compare view
            </footer>
          </>
        )}
      </main>

      <PaywallModal
        open={session.paywall.open}
        reason={session.paywall.reason}
        message={session.paywall.message}
        onClose={() => session.setPaywall({ ...session.paywall, open: false })}
      />
    </div>
  );
}
