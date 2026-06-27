"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApiError, fetchFilingPeriods, type FilingPeriodOption } from "@/lib/api";
import { CURRENT_YEAR, normalizeComparePeriodId } from "@/lib/filing-period";

interface FilingPeriodPickerProps {
  tickers: string[];
  fiscalYear?: number;
  period?: string;
  tier: string;
  onPaywall: (reason: string, message: string) => void;
}

function applyPeriodToParams(params: URLSearchParams, nextId: string) {
  params.delete("year");
  params.delete("period");

  if (nextId.startsWith("interim-")) {
    params.set("period", nextId);
    return;
  }
  if (nextId.startsWith("annual-")) {
    const year = parseInt(nextId.slice("annual-".length), 10);
    if (!Number.isNaN(year) && year < CURRENT_YEAR) {
      params.set("year", String(year));
    }
    params.set("period", nextId);
  }
}

export default function FilingPeriodPicker({
  tickers,
  fiscalYear,
  period,
  onPaywall,
}: FilingPeriodPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [periods, setPeriods] = useState<FilingPeriodOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const currentId =
    normalizeComparePeriodId(period) ??
    (fiscalYear != null ? `annual-${fiscalYear}` : periods[0]?.id ?? "latest");

  const loadPeriods = useCallback(async () => {
    if (tickers.length < 1) {
      setPeriods([]);
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      setPeriods(await fetchFilingPeriods(tickers));
    } catch (err) {
      if (err instanceof ApiError && err.isPaywall) {
        const detail = err.detail as { message?: string };
        onPaywall(
          "historical_data",
          detail.message ||
            "Historical filings and full SEC filing excerpts require a Professional subscription."
        );
      }
      setLoadError(err instanceof Error ? err.message : "Failed to load filing periods");
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  }, [tickers, onPaywall]);

  useEffect(() => {
    void loadPeriods();
  }, [loadPeriods]);

  function navigateWithPeriod(nextId: string) {
    const params = new URLSearchParams(searchParams.toString());
    applyPeriodToParams(params, nextId);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <label className="flex items-center gap-2 text-xs text-slate-600">
      <span className="hidden font-medium sm:inline">Filing</span>
      <select
        value={periods.some((p) => p.id === currentId) ? currentId : periods[0]?.id ?? currentId}
        onChange={(e) => navigateWithPeriod(e.target.value)}
        disabled={loading && periods.length === 0}
        className="max-w-[13rem] truncate rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60"
        aria-label="Filing period"
      >
        {loading && periods.length === 0 && <option value="latest">Loading…</option>}
        {!loading && periods.length === 0 && <option value="latest">Latest filing</option>}
        {periods.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
      {loadError && (
        <span className="text-[10px] text-amber-700" title={loadError}>
          Unavailable
        </span>
      )}
    </label>
  );
}
