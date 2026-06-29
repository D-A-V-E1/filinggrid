"use client";

import { useEffect } from "react";
import type { DeltaFlag } from "@/lib/delta-types";
import DeltaStrip from "./DeltaStrip";

interface DeltaLeftDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flags: DeltaFlag[];
  loading?: boolean;
  stripTotalCount?: number;
  totalFlagCount?: number;
  tagline?: string;
  onFlagClick: (flag: DeltaFlag) => void;
  onViewMoreInMap?: () => void;
}

export default function DeltaLeftDrawer({
  open,
  onOpenChange,
  flags,
  loading,
  stripTotalCount,
  totalFlagCount,
  tagline,
  onFlagClick,
  onViewMoreInMap,
}: DeltaLeftDrawerProps) {
  const hasContent =
    loading || flags.length > 0 || (totalFlagCount ?? 0) > 0 || (stripTotalCount ?? 0) > 0;

  const countLabel = loading ? "…" : String(flags.length || totalFlagCount || 0);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (!hasContent) return null;

  const stripProps = {
    flags,
    loading,
    stripTotalCount,
    totalFlagCount,
    tagline,
    layout: "rail" as const,
    onFlagClick: (flag: DeltaFlag) => {
      onFlagClick(flag);
      onOpenChange(false);
    },
    onViewMoreInMap: onViewMoreInMap
      ? () => {
          onOpenChange(false);
          onViewMoreInMap();
        }
      : undefined,
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="delta-left-drawer-tab absolute top-24 z-20 flex items-center gap-1 rounded-r-lg border border-l-0 border-brand-200 bg-white py-2 pl-1.5 pr-2 text-[10px] font-semibold uppercase tracking-wide text-brand-800 shadow-md transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 md:top-28"
          aria-expanded={false}
          aria-controls="key-deltas-drawer"
          aria-label={`Open key deltas, ${countLabel} items`}
        >
          <span className="delta-left-drawer-tab-label" aria-hidden>
            Deltas
          </span>
          <span className="rounded-full bg-brand-100 px-1.5 py-0.5 font-mono text-[10px] text-brand-900">
            {countLabel}
          </span>
        </button>
      )}

      <div
        className={`delta-left-drawer-root ${open ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <button
          type="button"
          className={`delta-left-drawer-backdrop ${open ? "opacity-100" : "opacity-0"}`}
          aria-label="Close key deltas panel"
          tabIndex={open ? 0 : -1}
          onClick={() => onOpenChange(false)}
        />
        <aside
          id="key-deltas-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Key deltas"
          className={`delta-left-drawer-panel ${open ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Key deltas
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <DeltaStrip {...stripProps} />
          </div>
        </aside>
      </div>
    </>
  );
}
