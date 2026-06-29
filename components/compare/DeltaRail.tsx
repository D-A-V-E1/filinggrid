"use client";

import { useState } from "react";
import type { DeltaFlag } from "@/lib/delta-types";
import DeltaStrip from "./DeltaStrip";

interface DeltaRailProps {
  flags: DeltaFlag[];
  loading?: boolean;
  stripTotalCount?: number;
  totalFlagCount?: number;
  tagline?: string;
  onFlagClick: (flag: DeltaFlag) => void;
  onViewMoreInMap?: () => void;
}

export default function DeltaRail({
  flags,
  loading,
  stripTotalCount,
  totalFlagCount,
  tagline,
  onFlagClick,
  onViewMoreInMap,
}: DeltaRailProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const hasRailContent =
    loading || flags.length > 0 || (totalFlagCount ?? 0) > 0 || (stripTotalCount ?? 0) > 0;

  if (!hasRailContent) return null;

  const stripProps = {
    flags,
    loading,
    stripTotalCount,
    totalFlagCount,
    tagline,
    layout: "rail" as const,
    onFlagClick: (flag: DeltaFlag) => {
      onFlagClick(flag);
      setMobileOpen(false);
    },
    onViewMoreInMap,
  };

  const tabLabel =
    loading ? "Key deltas…" : `Key deltas · ${flags.length || totalFlagCount || 0}`;

  return (
    <>
      <aside className="delta-rail hidden h-full w-[280px] shrink-0 border-l border-slate-200 bg-white xl:flex xl:flex-col">
        <DeltaStrip {...stripProps} />
      </aside>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="absolute right-3 top-3 z-30 rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-800 shadow-md transition hover:bg-brand-50 xl:hidden"
        aria-label="Open key deltas panel"
      >
        {tabLabel}
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Close key deltas panel"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 flex w-[min(100%,280px)] flex-col border-l border-slate-200 bg-white shadow-xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-2 z-10 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
            >
              Close
            </button>
            <div className="min-h-0 flex-1 overflow-hidden pt-1">
              <DeltaStrip {...stripProps} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
