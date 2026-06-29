"use client";

import { useEffect, useState } from "react";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export interface DeltaCountBadgeProps {
  count: number;
  /** When true, cycle digits instead of showing the live count. */
  spinning: boolean;
  hasFlags: boolean;
}

export default function DeltaCountBadge({ count, spinning, hasFlags }: DeltaCountBadgeProps) {
  const [digitIdx, setDigitIdx] = useState(0);
  const [displayCount, setDisplayCount] = useState(count);

  useEffect(() => {
    if (!spinning) return;
    const id = window.setInterval(() => {
      setDigitIdx((i) => (i + 1) % DIGITS.length);
    }, 65);
    return () => window.clearInterval(id);
  }, [spinning]);

  useEffect(() => {
    if (spinning) return;
    if (count === 0) {
      setDisplayCount(0);
      return;
    }
    let frame = 0;
    let start: number | null = null;
    const duration = 380;
    const step = (ts: number) => {
      if (start == null) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDisplayCount(Math.round(count * eased));
      if (t < 1) frame = requestAnimationFrame(step);
      else setDisplayCount(count);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [spinning, count]);

  const emphasized = hasFlags && count > 0;
  const boxClass = `flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold shadow-sm tabular-nums ${
    emphasized || spinning
      ? "bg-brand-600 text-white shadow-brand-600/25"
      : "bg-slate-200 text-slate-600 shadow-slate-200/50"
  }`;

  if (spinning) {
    return (
      <span className={boxClass} aria-hidden>
        <span className="relative block h-4 w-3 overflow-hidden">
          <span
            key={digitIdx}
            className="absolute inset-0 flex items-center justify-center animate-delta-digit-tick"
          >
            {DIGITS[digitIdx]}
          </span>
        </span>
      </span>
    );
  }

  return (
    <span className={boxClass} aria-live="polite">
      {displayCount}
    </span>
  );
}
