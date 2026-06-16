"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { buildPeerSlug } from "@/lib/utils";
import { searchTickers } from "@/lib/api";
import PrivacyStrip from "./PrivacyStrip";

interface TickerChip {
  ticker: string;
  name?: string;
}

export default function TickerSearchBar({
  initialTickers = [],
  compact = false,
  fiscalYear,
}: {
  initialTickers?: string[];
  compact?: boolean;
  fiscalYear?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);
  const [tickers, setTickers] = useState<TickerChip[]>(
    initialTickers.map((t) => ({ ticker: t.toUpperCase() }))
  );
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ ticker: string; company_name: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchError, setSearchError] = useState("");
  const queryRequestIdRef = useRef(0);

  const compareUrl = useMemo(() => {
    if (tickers.length < 2) return null;
    const slug = buildPeerSlug(tickers.map((t) => t.ticker));
    const currentYear = new Date().getFullYear();
    const year = fiscalYear ?? currentYear;
    return year < currentYear ? `/compare/${slug}?year=${year}` : `/compare/${slug}`;
  }, [tickers, fiscalYear]);

  useEffect(() => {
    if (!compareUrl) return;
    router.prefetch(compareUrl);
  }, [compareUrl, router]);

  useEffect(() => {
    if (!isNavigating || !compareUrl) return;
    const targetPath = compareUrl.split("?")[0];
    if (pathname === targetPath) setIsNavigating(false);
  }, [pathname, compareUrl, isNavigating]);

  useEffect(() => {
    if (!isNavigating) return;
    const timer = window.setTimeout(() => setIsNavigating(false), 12_000);
    return () => window.clearTimeout(timer);
  }, [isNavigating]);

  async function handleQueryChange(value: string) {
    const normalized = value.toUpperCase();
    const requestId = ++queryRequestIdRef.current;

    setQuery(normalized);
    setSearchError("");
    if (normalized.trim().length >= 1) {
      try {
        const results = await searchTickers(normalized);
        if (requestId !== queryRequestIdRef.current) return;
        const filtered = results.filter((r) => !tickers.some((t) => t.ticker === r.ticker));
        setSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
      } catch {
        if (requestId !== queryRequestIdRef.current) return;
        setSuggestions([]);
        setSearchError("Ticker search unavailable — is the API running?");
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }

  function addTicker(ticker: string, name?: string) {
    const upper = ticker.toUpperCase();
    if (tickers.some((t) => t.ticker === upper)) return;
    setTickers([...tickers, { ticker: upper, name }]);
    setQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function removeTicker(ticker: string) {
    setTickers(tickers.filter((t) => t.ticker !== ticker));
  }

  function handleCompare() {
    if (!compareUrl || isNavigating) return;
    setIsNavigating(true);
    router.push(compareUrl);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && query) {
      addTicker(query);
    }
  }

  return (
    <div className={compact ? "w-full" : "mx-auto w-full max-w-3xl"}>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 p-3">
          {tickers.map((t, i) => (
            <span key={t.ticker} className="flex items-center gap-1">
              {i > 0 && (
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  vs
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-sm font-mono font-medium text-slate-800">
                {t.ticker}
                <button
                  type="button"
                  onClick={() => removeTicker(t.ticker)}
                  className="ml-0.5 text-slate-400 hover:text-slate-700"
                  aria-label={`Remove ${t.ticker}`}
                >
                  ×
                </button>
              </span>
            </span>
          ))}

          <div className="relative min-w-[120px] flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => query && suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder={tickers.length ? "Add ticker…" : "Enter ticker (e.g. AAPL)"}
              className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
              aria-label="Ticker search"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {suggestions.map((s) => (
                  <li key={s.ticker}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onMouseDown={() => addTicker(s.ticker, s.company_name)}
                    >
                      <span className="font-mono font-semibold text-brand-600">{s.ticker}</span>
                      <span className="truncate text-slate-500">{s.company_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={handleCompare}
            disabled={tickers.length < 2 || isNavigating}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isNavigating ? "Opening…" : "Compare"}
          </button>
        </div>
      </div>
      {!compact && <PrivacyStrip className="mt-3 px-1" />}
      {searchError && (
        <p className="mt-2 px-1 text-xs text-amber-700" role="alert">
          {searchError}
        </p>
      )}
    </div>
  );
}
