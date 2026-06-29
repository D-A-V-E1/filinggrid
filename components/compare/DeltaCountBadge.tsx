"use client";

import { useEffect, useState } from "react";

export interface DeltaCountBadgeProps {
  count: number;
  hasFlags: boolean;
  /** When true, badge stays neutral until the first flag appears. */
  loading?: boolean;
}

export default function DeltaCountBadge({ count, hasFlags, loading = false }: DeltaCountBadgeProps) {
  const [displayCount, setDisplayCount] = useState(count);

  useEffect(() => {
    if (count === 0) {
      setDisplayCount(0);
      return;
    }
    setDisplayCount((prev) => Math.max(prev, count));
  }, [count]);

  const emphasized = hasFlags && displayCount > 0;
  const boxClass = `flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold shadow-sm tabular-nums ${
    emphasized
      ? "bg-brand-600 text-white shadow-brand-600/25"
      : "bg-slate-200 text-slate-600 shadow-slate-200/50"
  }`;

  return (
    <span className={boxClass} aria-live="polite" aria-busy={loading && displayCount === 0}>
      {displayCount}
    </span>
  );
}
