"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEV_TIER_CHANGE_EVENT,
  type DevTier,
  getDevTierFromStorage,
  isDevTierToggleEnabled,
  setDevTierInStorage,
} from "@/lib/dev-tier";
import { getMaxColumns } from "@/lib/tier-limits";

interface DevTierToggleProps {
  /** Effective tier from `/auth/me` (before or without dev override). */
  currentTier: string;
  onChange?: (tier: DevTier) => void;
}

function normalizeTier(tier: string): DevTier {
  return tier === "professional" ? "professional" : "free";
}

export default function DevTierToggle({ currentTier, onChange }: DevTierToggleProps) {
  const enabled = isDevTierToggleEnabled();
  const [tier, setTier] = useState<DevTier>(() => normalizeTier(currentTier));

  useEffect(() => {
    const stored = getDevTierFromStorage();
    if (stored) {
      setTier(stored);
      return;
    }
    setTier(normalizeTier(currentTier));
  }, [currentTier]);

  const select = useCallback(
    (next: DevTier) => {
      setDevTierInStorage(next);
      setTier(next);
      window.dispatchEvent(new CustomEvent(DEV_TIER_CHANGE_EVENT, { detail: next }));
      onChange?.(next);
    },
    [onChange]
  );

  if (!enabled) return null;

  const maxColumns = getMaxColumns(tier);

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1"
      title="Dev-only tier override — not included in production builds"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Dev</span>
      <div className="flex rounded-md border border-amber-200 bg-white p-0.5">
        {(["free", "professional"] as const).map((value) => {
          const label = value === "professional" ? "Professional" : "Free";
          const active = tier === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => select(value)}
              aria-pressed={active}
              className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-amber-100 text-amber-900"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <span className="hidden text-xs text-amber-900/70 sm:inline">max {maxColumns} columns</span>
    </div>
  );
}
