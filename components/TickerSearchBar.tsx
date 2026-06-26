"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { buildPeerSlug } from "@/lib/utils";
import { comparePathWithPeriod, resolveComparePeriod } from "@/lib/filing-period";
import { searchTickers } from "@/lib/api";
import { retryWithBackoff } from "@/lib/api-warmup";
import { tickerSearchUnavailableMessage } from "@/lib/api-environment";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveTier } from "@/hooks/useEffectiveTier";
import { addTickerLimitMessage } from "@/lib/tier-limits";
import PaywallModal from "./billing/PaywallModal";
import PrivacyStrip from "./PrivacyStrip";

interface TickerChip {
  ticker: string;
  name?: string;
}

const POPULAR_TICKERS = [
  { ticker: "AAPL", company_name: "Apple Inc." },
  { ticker: "MSFT", company_name: "Microsoft Corporation" },
  { ticker: "NVDA", company_name: "NVIDIA Corporation" },
  { ticker: "GOOGL", company_name: "Alphabet Inc." },
  { ticker: "JPM", company_name: "JPMorgan Chase & Co." },
  { ticker: "GS", company_name: "Goldman Sachs Group Inc." },
];

const DROPDOWN_WIDTH = 288;
const VIEWPORT_PADDING = 8;
const DROPDOWN_GAP = 4;

function computeDropdownPosition(trigger: DOMRect): CSSProperties {
  const viewportWidth = window.innerWidth;
  let left = trigger.left;
  left = Math.max(VIEWPORT_PADDING, left);
  left = Math.min(left, viewportWidth - VIEWPORT_PADDING - DROPDOWN_WIDTH);

  const top = trigger.bottom + DROPDOWN_GAP;
  const maxHeight = window.innerHeight - top - VIEWPORT_PADDING;

  return { top, left, maxHeight, width: DROPDOWN_WIDTH };
}

export default function TickerSearchBar({
  initialTickers = [],
  compact = false,
  fiscalYear,
  period,
  onPaywall,
}: {
  initialTickers?: string[];
  compact?: boolean;
  fiscalYear?: number;
  period?: string;
  onPaywall?: (reason: string, message: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { auth } = useAuth();
  const { tier, isPro, maxColumns } = useEffectiveTier(auth);
  const [isNavigating, setIsNavigating] = useState(false);
  const [limitMessage, setLimitMessage] = useState("");
  const [internalPaywall, setInternalPaywall] = useState({
    open: false,
    reason: "",
    message: "",
  });
  const [tickers, setTickers] = useState<TickerChip[]>(
    initialTickers.map((t) => ({ ticker: t.toUpperCase() }))
  );
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ ticker: string; company_name: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);
  const queryRequestIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const blurCloseTimerRef = useRef<number | null>(null);

  const compareUrl = useMemo(() => {
    if (tickers.length < 2 || tickers.length > maxColumns) return null;
    const slug = buildPeerSlug(tickers.map((t) => t.ticker));
    const comparePeriod = resolveComparePeriod(
      fiscalYear != null ? String(fiscalYear) : undefined,
      period
    );
    return comparePathWithPeriod(slug, comparePeriod);
  }, [tickers, fiscalYear, period, maxColumns]);

  function showColumnLimitPaywall(message: string) {
    if (onPaywall) {
      onPaywall("column_limit", message);
      return;
    }
    setInternalPaywall({ open: true, reason: "column_limit", message });
  }

  function popularSuggestions() {
    return POPULAR_TICKERS.filter((r) => !tickers.some((t) => t.ticker === r.ticker));
  }

  function localMatches(q: string) {
    const normalized = q.trim().toUpperCase();
    if (!normalized) return popularSuggestions();
    return POPULAR_TICKERS.filter(
      (r) =>
        !tickers.some((t) => t.ticker === r.ticker) &&
        (r.ticker.includes(normalized) || r.company_name.toUpperCase().includes(normalized))
    );
  }

  function openSuggestions(next: { ticker: string; company_name: string }[]) {
    setSuggestions(next);
    setSearchError("");
    setShowSuggestions(true);
  }

  function showPopularSuggestions() {
    openSuggestions(popularSuggestions());
  }

  function scheduleCloseSuggestions() {
    if (blurCloseTimerRef.current != null) {
      window.clearTimeout(blurCloseTimerRef.current);
    }
    blurCloseTimerRef.current = window.setTimeout(() => {
      blurCloseTimerRef.current = null;
      setShowSuggestions(false);
    }, 150);
  }

  function cancelCloseSuggestions() {
    if (blurCloseTimerRef.current != null) {
      window.clearTimeout(blurCloseTimerRef.current);
      blurCloseTimerRef.current = null;
    }
  }

  async function warmupApi(): Promise<boolean> {
    const result = await retryWithBackoff(() => searchTickers("A"), {
      location: "TickerSearchBar.tsx:warmupApi",
      isSuccess: (rows) => Array.isArray(rows),
    });
    if (result) {
      setSearchError("");
      return true;
    }
    setSearchError(tickerSearchUnavailableMessage());
    return false;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await warmupApi();
      if (!cancelled && !ok) {
        console.warn("[TickerSearchBar] API warmup failed after retries");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  useLayoutEffect(() => {
    if (!showSuggestions) {
      setDropdownStyle(null);
      return;
    }

    function updatePosition() {
      const input = inputRef.current;
      if (!input) return;
      setDropdownStyle(computeDropdownPosition(input.getBoundingClientRect()));
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showSuggestions, suggestions.length, searching, searchError, query]);

  async function runSearch(normalized: string, requestId: number) {
    setSearching(true);
    openSuggestions(localMatches(normalized));
    try {
      const results = await searchTickers(normalized);
      if (requestId !== queryRequestIdRef.current) return;
      const filtered = results.filter((r) => !tickers.some((t) => t.ticker === r.ticker));
      setSuggestions(filtered);
      setSearchError("");
    } catch {
      if (requestId !== queryRequestIdRef.current) return;
      setSuggestions(localMatches(normalized));
      setShowSuggestions(true);
      setSearchError(tickerSearchUnavailableMessage());
    } finally {
      if (requestId === queryRequestIdRef.current) setSearching(false);
    }
  }

  async function handleQueryChange(value: string) {
    const normalized = value.toUpperCase();
    const requestId = ++queryRequestIdRef.current;

    setQuery(normalized);
    if (normalized.trim().length >= 1) {
      setSearchError("");
      await runSearch(normalized, requestId);
    } else {
      setSearching(false);
      showPopularSuggestions();
    }
  }

  async function retrySearch() {
    if (query.trim()) {
      const requestId = ++queryRequestIdRef.current;
      setSearchError("");
      await runSearch(query, requestId);
      return;
    }
    setSearchError("");
    setShowSuggestions(true);
    const ok = await warmupApi();
    if (ok) showPopularSuggestions();
  }

  function addTicker(ticker: string, name?: string) {
    const upper = ticker.toUpperCase();
    if (tickers.some((t) => t.ticker === upper)) return;

    if (tickers.length >= maxColumns) {
      const message = addTickerLimitMessage(tier, maxColumns);
      setLimitMessage(message);
      if (!isPro) {
        showColumnLimitPaywall(message);
      }
      return;
    }

    setLimitMessage("");
    setTickers([...tickers, { ticker: upper, name }]);
    setQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function removeTicker(ticker: string) {
    setTickers(tickers.filter((t) => t.ticker !== ticker));
  }

  function handleCompare() {
    if (isNavigating) return;
    if (tickers.length > maxColumns) {
      const message = addTickerLimitMessage(tier, maxColumns);
      setLimitMessage(message);
      if (!isPro) {
        showColumnLimitPaywall(message);
      }
      return;
    }
    if (!compareUrl) return;
    setIsNavigating(true);
    router.push(compareUrl);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && query) {
      addTicker(query);
    }
  }

  const hasQuery = query.trim().length > 0;
  const showNoMatches =
    hasQuery && !searching && !searchError && suggestions.length === 0;

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

          <div
            className="relative min-w-[120px] flex-1"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              cancelCloseSuggestions();
              if (!query.trim()) showPopularSuggestions();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => void handleQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                cancelCloseSuggestions();
                if (query.trim()) {
                  setShowSuggestions(true);
                  if (!searching && suggestions.length === 0 && !searchError) {
                    void handleQueryChange(query);
                  }
                } else {
                  showPopularSuggestions();
                }
              }}
              onBlur={(e) => {
                const next = e.relatedTarget as Node | null;
                if (next && panelRef.current?.contains(next)) return;
                scheduleCloseSuggestions();
              }}
              placeholder={tickers.length ? "Add ticker…" : "Enter ticker (e.g. AAPL)"}
              className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
              aria-label="Ticker search"
              aria-expanded={showSuggestions}
              aria-haspopup="listbox"
            />
            {showSuggestions && (
              <ul
                ref={panelRef}
                className={`fixed z-50 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg transition-opacity ${
                  dropdownStyle ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                style={dropdownStyle ?? undefined}
                role="listbox"
              >
                {!hasQuery && suggestions.length > 0 && (
                  <li className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    Popular tickers
                  </li>
                )}
                {searching && suggestions.length === 0 && !searchError && (
                  <li className="px-3 py-2 text-sm text-slate-500">Searching tickers…</li>
                )}
                {showNoMatches && (
                  <li className="px-3 py-2 text-sm text-slate-500">No matches for “{query}”</li>
                )}
                {searchError && (
                  <li className="px-3 py-2">
                    <p className="text-sm text-amber-700" role="alert">
                      {searchError}
                    </p>
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        void retrySearch();
                      }}
                    >
                      Retry search
                    </button>
                  </li>
                )}
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
      {searchError && !showSuggestions && (
        <p className="mt-2 px-1 text-xs text-amber-700" role="alert">
          {searchError}
        </p>
      )}
      {limitMessage && (
        <p className="mt-2 px-1 text-xs font-medium text-amber-800" role="alert">
          {limitMessage}
        </p>
      )}
      {!onPaywall && (
        <PaywallModal
          open={internalPaywall.open}
          reason={internalPaywall.reason}
          message={internalPaywall.message}
          onClose={() => setInternalPaywall((p) => ({ ...p, open: false }))}
        />
      )}
    </div>
  );
}
