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
    onClose: () => onOpenChange(false),
  };

  return (
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
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DeltaStrip {...stripProps} />
        </div>
      </aside>
    </div>
  );
}
