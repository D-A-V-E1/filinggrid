"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchFilingPeriods } from "@/lib/api";
import { CURRENT_YEAR, normalizeComparePeriodId, type ComparePeriod } from "@/lib/filing-period";

function fallbackPeriodLabel(period: ComparePeriod): string {
  const id =
    normalizeComparePeriodId(period.period) ??
    (period.fiscalYear != null ? `annual-${period.fiscalYear}` : null);

  if (id?.startsWith("interim-")) {
    const m = id.match(/^interim-(\d{4})-(Q[1-4])/i);
    if (m) return `${m[2]} ${m[1]}`;
  }
  if (id?.startsWith("annual-")) {
    const year = parseInt(id.slice("annual-".length), 10);
    if (!Number.isNaN(year)) return `FY ${year} 10-K`;
  }
  if (period.fiscalYear != null && period.fiscalYear < CURRENT_YEAR) {
    return `FY ${period.fiscalYear} 10-K`;
  }
  return "Latest filing";
}

export function useComparePeriodLabel(tickers: string[], period: ComparePeriod): string {
  const [label, setLabel] = useState(() => fallbackPeriodLabel(period));

  const currentId =
    normalizeComparePeriodId(period.period) ??
    (period.fiscalYear != null ? `annual-${period.fiscalYear}` : null);

  const load = useCallback(async () => {
    if (tickers.length < 1) {
      setLabel(fallbackPeriodLabel(period));
      return;
    }
    try {
      const periods = await fetchFilingPeriods(tickers);
      const match = periods.find((p) => p.id === currentId);
      setLabel(match?.label ?? fallbackPeriodLabel(period));
    } catch {
      setLabel(fallbackPeriodLabel(period));
    }
  }, [tickers, period, currentId]);

  useEffect(() => {
    void load();
  }, [load]);

  return label;
}
