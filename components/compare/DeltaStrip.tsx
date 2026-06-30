"use client";

import { DeltaScanningTitle } from "@/components/compare/DeltaScanningAffordance";
import type { DeltaFlag } from "@/lib/delta-types";

export type DeltaStripLayout = "rail" | "strip" | "nav";

interface DeltaStripProps {
  flags: DeltaFlag[];
  loading?: boolean;
  /** Total mainstream-eligible flags before strip cap. */
  stripTotalCount?: number;
  /** Total map-worthy flags (full delta map). */
  totalFlagCount?: number;
  tagline?: string;
  layout?: DeltaStripLayout;
  onFlagClick: (flag: DeltaFlag) => void;
  /** Strip only: opens section map from header CTA. */
  onViewMap?: () => void;
  /** Rail only: footer link when more flags exist in the map. */
  onViewMoreInMap?: () => void;
  /** Rail only: drawer close control (shown in header). */
  onClose?: () => void;
  /** Nav only: hide built-in header when parent provides tab chrome. */
  hideHeader?: boolean;
}

const SEVERITY_STYLES: Record<DeltaFlag["severity"], string> = {
  P1: "border-amber-300 bg-amber-50 text-amber-950",
  P2: "border-brand-200 bg-brand-50/70 text-brand-900",
  P3: "border-slate-200 bg-slate-50 text-slate-700",
};

export default function DeltaStrip({
  flags,
  loading,
  stripTotalCount,
  totalFlagCount,
  tagline,
  layout = "rail",
  onFlagClick,
  onViewMap,
  onViewMoreInMap,
  onClose,
  hideHeader = false,
}: DeltaStripProps) {
  const mainstreamTotal = stripTotalCount ?? flags.length;
  const stripHiddenCount = Math.max(0, mainstreamTotal - flags.length);
  const mapHiddenCount = Math.max(0, (totalFlagCount ?? mainstreamTotal) - flags.length);
  const viewMoreHandler = onViewMoreInMap ?? onViewMap;
  const moreInMapCount = Math.max(stripHiddenCount, mapHiddenCount);

  if (layout === "rail" || layout === "nav") {
    const compact = layout === "nav";
    return (
      <section className="delta-rail-inner flex h-full min-h-0 flex-col" aria-label="Key deltas">
        {!hideHeader && (
          <header
            className={`shrink-0 border-b border-slate-100 ${compact ? "px-2 py-2" : "px-3 py-2.5"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2
                    className={`font-semibold uppercase tracking-wider text-slate-600 ${
                      compact ? "text-[10px]" : "text-[11px]"
                    }`}
                  >
                    <DeltaScanningTitle scanning={!!loading} iconClassName={compact ? "h-2.5 w-2.5" : undefined}>
                      Key deltas
                    </DeltaScanningTitle>
                  </h2>
                  {flags.length > 0 && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                      {flags.length}
                    </span>
                  )}
                </div>
                {tagline && !loading && (
                  <p
                    className={`leading-snug text-slate-500 ${
                      compact ? "mt-1 text-[10px] line-clamp-2" : "mt-1.5 text-[11px]"
                    }`}
                  >
                    {tagline}
                  </p>
                )}
              </div>
              {!compact && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Close
                </button>
              )}
            </div>
          </header>
        )}

        <div className={`min-h-0 flex-1 overflow-y-auto ${compact ? "px-2 py-1.5" : "px-3 py-2"}`}>
          {!loading && flags.length === 0 && (
            <p className={`text-slate-500 ${compact ? "text-[10px]" : "text-xs"}`}>
              {totalFlagCount && totalFlagCount > 0
                ? "No headline movers or key events in this group."
                : "No material differences detected across scanned sections."}
            </p>
          )}
          {flags.length > 0 && (
            <ul className={`flex flex-col ${compact ? "gap-1" : "gap-1.5"}`}>
              {flags.map((flag) => (
                <li key={flag.id}>
                  <button
                    type="button"
                    onClick={() => onFlagClick(flag)}
                    className={`w-full rounded-lg border text-left font-medium transition hover:shadow-sm ${
                      compact ? "px-2 py-1.5 text-[11px]" : "px-2.5 py-2 text-xs"
                    } ${SEVERITY_STYLES[flag.severity]}`}
                    title={`${flag.severity} · ${flag.ruleId}`}
                  >
                    <span className="font-mono text-[10px] uppercase opacity-70">{flag.ticker}</span>
                    <span className="mx-1 opacity-40">·</span>
                    <span className="line-clamp-3">{flag.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!loading && moreInMapCount > 0 && viewMoreHandler && (
          <footer className={`shrink-0 border-t border-slate-100 ${compact ? "px-2 py-1.5" : "px-3 py-2"}`}>
            <button
              type="button"
              onClick={viewMoreHandler}
              className={`w-full text-left font-medium text-brand-700 hover:text-brand-800 hover:underline ${
                compact ? "text-[10px]" : "text-xs"
              }`}
            >
              View full report (+{moreInMapCount})
            </button>
          </footer>
        )}
      </section>
    );
  }

  return (
    <section
      className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-brand-50/30 px-4 py-3"
      aria-label="Key deltas"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          <DeltaScanningTitle scanning={!!loading}>Key deltas</DeltaScanningTitle>
        </h2>
        {!loading && flags.length === 0 && (
          <span className="text-xs text-slate-500">
            {totalFlagCount && totalFlagCount > 0
              ? "No headline movers or key events in this group."
              : "No material differences detected across scanned sections."}
          </span>
        )}
        {stripHiddenCount > 0 && (
          <span className="text-xs text-slate-500">+{stripHiddenCount} more</span>
        )}
        {!loading && mapHiddenCount > 0 && onViewMap && totalFlagCount != null && (
          <button
            type="button"
            onClick={onViewMap}
            className="ml-auto rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800 transition hover:bg-brand-100 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            View delta report · {totalFlagCount} total
          </button>
        )}
      </div>

      {tagline && !loading && <p className="mb-2 text-xs text-slate-500">{tagline}</p>}

      {flags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {flags.map((flag) => (
            <button
              key={flag.id}
              type="button"
              onClick={() => onFlagClick(flag)}
              className={`max-w-full rounded-full border px-3 py-1.5 text-left text-xs font-medium transition hover:shadow-sm ${SEVERITY_STYLES[flag.severity]}`}
              title={`${flag.severity} · ${flag.ruleId}`}
            >
              <span className="font-mono text-[10px] uppercase opacity-70">{flag.ticker}</span>
              <span className="mx-1.5 opacity-40">·</span>
              <span>{flag.label}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
