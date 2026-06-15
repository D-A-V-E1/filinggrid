"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 12 }, (_, i) => CURRENT_YEAR - i);

interface YearPickerProps {
  fiscalYear?: number;
  tier: string;
  onPaywall: (reason: string, message: string) => void;
}

export default function YearPicker({ fiscalYear, tier, onPaywall }: YearPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedYear = fiscalYear ?? CURRENT_YEAR;

  function handleChange(nextYear: number) {
    if (tier !== "professional" && nextYear < CURRENT_YEAR) {
      onPaywall(
        "historical_data",
        "Historical filings require a Professional subscription."
      );
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    if (nextYear === CURRENT_YEAR) {
      params.delete("year");
    } else {
      params.set("year", String(nextYear));
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <label className="flex items-center gap-2 text-xs text-slate-600">
      <span className="hidden font-medium sm:inline">Fiscal year</span>
      <select
        value={selectedYear}
        onChange={(e) => handleChange(parseInt(e.target.value, 10))}
        className="rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        aria-label="Fiscal year"
      >
        {YEAR_OPTIONS.map((year) => (
          <option key={year} value={year}>
            FY {year}
            {year === CURRENT_YEAR ? " (current)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
