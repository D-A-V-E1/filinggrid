"use client";

import { useEffect, useRef, useState } from "react";

export interface DeltaCountBadgeProps {
  count: number;
  hasFlags: boolean;
  /** When true, badge stays neutral until the first flag appears. */
  loading?: boolean;
  /** Monotonic floor — survives remounts when passed from session store. */
  countFloor?: number;
  /** When this changes (e.g. compare cache key), internal monotonic state resets. */
  resetKey?: string;
}

/** Monotonic display count for delta badges — exported for unit tests. */
export function monotonicDeltaDisplayCount(
  prev: number,
  count: number,
  loading: boolean,
  countFloor: number
): number {
  if (loading) {
    if (count === 0 && countFloor === 0) return 0;
    return Math.max(prev, count, countFloor);
  }
  if (count > 0) return count;
  if (countFloor > 0) return countFloor;
  return 0;
}

export default function DeltaCountBadge({
  count,
  hasFlags,
  loading = false,
  countFloor = 0,
  resetKey,
}: DeltaCountBadgeProps) {
  const [displayCount, setDisplayCount] = useState(count);
  const resetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (resetKey !== resetKeyRef.current) {
      resetKeyRef.current = resetKey;
      setDisplayCount(count);
    }
  }, [resetKey, count]);

  useEffect(() => {
    setDisplayCount((prev) => monotonicDeltaDisplayCount(prev, count, loading, countFloor));
  }, [count, loading, countFloor]);

  const emphasized = hasFlags && displayCount > 0;
  const boxClass = `flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold shadow-sm tabular-nums ${
    emphasized
      ? "bg-brand-600 text-white shadow-brand-600/25"
      : "bg-slate-200 text-slate-600 shadow-slate-200/50"
  } ${loading ? "ring-2 ring-brand-300/50 ring-offset-1 animate-pulse" : ""}`;

  return (
    <span className={boxClass} aria-live="polite" aria-busy={loading}>
      {displayCount}
    </span>
  );
}
