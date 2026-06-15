"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  fetchFinancials,
  getAuthMe,
  parseFilingsStream,
  type FinancialsXbrl,
  type FilingColumn,
  type ParseResponse,
} from "@/lib/api";
import { getComparableSectionIds } from "@/lib/sections";
import { hasRenderableSections, loadParseMeta, parseMetaCacheKey, saveParseMeta } from "@/lib/parse-cache";
import FilingColumnComponent from "./FilingColumn";
import SectionNav from "./SectionNav";
import PaywallModal from "../billing/PaywallModal";
import TickerSearchBar from "../TickerSearchBar";

interface CompareGridProps {
  tickers: string[];
  fiscalYear?: number;
}

export default function CompareGrid({ tickers, fiscalYear }: CompareGridProps) {
  const cacheKey = useMemo(() => parseMetaCacheKey(tickers, fiscalYear), [tickers, fiscalYear]);
  const [data, setData] = useState<ParseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTickers, setLoadingTickers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [paywall, setPaywall] = useState<{ open: boolean; reason: string; message: string }>({
    open: false,
    reason: "",
    message: "",
  });
  const [tier, setTier] = useState("free");
  const [financialsByTicker, setFinancialsByTicker] = useState<Record<string, FinancialsXbrl>>({});
  const loadIdRef = useRef(0);

  const availableSectionIds = useMemo(() => {
    const ids = new Set<string>();
    if (!data) return ids;
    for (const col of data.columns) {
      for (const s of col.sections) ids.add(s.id);
    }
    return ids;
  }, [data]);

  const loadFilings = useCallback(async () => {
    const loadId = ++loadIdRef.current;
    setLoading(true);
    setLoadingTickers(tickers);
    setError("");

    const cached = loadParseMeta(cacheKey);
    if (cached && hasRenderableSections(cached)) {
      setData(cached);
      setLoading(false);
      setLoadingTickers([]);
      const navigable = getComparableSectionIds(cached.columns);
      setActiveSection((prev) => prev ?? navigable[0] ?? null);
      getAuthMe()
        .then((auth) => setTier(auth.tier))
        .catch(() => null);
      return;
    }

    getAuthMe()
      .then((auth) => setTier(auth.tier))
      .catch(() => null);

    let catalog: ParseResponse["section_catalog"] = [];
    let parsedAt = new Date().toISOString();
    const columns: FilingColumn[] = [];

    try {
      await parseFilingsStream(tickers, fiscalYear, {
        onCatalog: (sectionCatalog, at) => {
          if (loadId !== loadIdRef.current) return;
          catalog = sectionCatalog;
          parsedAt = at;
        },
        onColumn: (column) => {
          if (loadId !== loadIdRef.current) return;
          const idx = columns.findIndex((c) => c.ticker === column.ticker);
          if (idx >= 0) columns[idx] = column;
          else columns.push(column);

          setLoadingTickers((pending) => pending.filter((t) => t !== column.ticker));
          setData({
            columns: [...columns],
            section_catalog: catalog,
            parsed_at: parsedAt,
            stateless: false,
          });

          const navigable = getComparableSectionIds(columns);
          setActiveSection((prev) => prev ?? navigable[0] ?? null);
        },
        onDone: (at) => {
          if (loadId !== loadIdRef.current) return;
          parsedAt = at;
          const result: ParseResponse = {
            columns: [...columns],
            section_catalog: catalog,
            parsed_at: parsedAt,
            stateless: false,
          };
          setData(result);
          saveParseMeta(cacheKey, result);
          setLoadingTickers([]);
        },
      });
    } catch (err) {
      if (loadId !== loadIdRef.current) return;
      if (err instanceof ApiError && err.isPaywall) {
        const detail = err.detail as { reason?: string; message?: string };
        setPaywall({
          open: true,
          reason: detail.reason || "subscription_required",
          message: detail.message || "Upgrade to Professional to continue.",
        });
      } else {
        setError(err instanceof Error ? err.message : "Failed to load filings");
        if (columns.length === 0) setData(null);
      }
      setLoadingTickers([]);
    } finally {
      if (loadId === loadIdRef.current) {
        setLoading(false);
      }
    }
  }, [cacheKey, tickers, fiscalYear]);

  useEffect(() => {
    loadFilings();
  }, [loadFilings]);

  useEffect(() => {
    if (!data) return;
    for (const col of data.columns) {
      if (col.error) continue;
      fetchFinancials(col.ticker, fiscalYear)
        .then((fin) => {
          setFinancialsByTicker((prev) =>
            prev[col.ticker] ? prev : { ...prev, [col.ticker]: fin }
          );
        })
        .catch(() => null);
    }
  }, [data, fiscalYear]);

  const handleSectionSelect = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
  }, []);

  const activeSectionLabel = useMemo(() => {
    if (!data || !activeSection) return null;
    return data.section_catalog.find((s) => s.id === activeSection)?.label ?? null;
  }, [data, activeSection]);

  const showWorkspace = data && data.columns.length > 0 && !loading;
  const showPartialWorkspace = data && data.columns.length > 0 && loading;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 py-2">
        <TickerSearchBar initialTickers={tickers} compact />
        <div className="ml-auto flex items-center gap-3">
          {tier === "professional" && (
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
              Professional
            </span>
          )}
          {loading && (
            <span className="text-xs text-slate-400">
              {loadingTickers.length > 0
                ? `Loading ${loadingTickers.join(", ")}…`
                : "Loading filings…"}
            </span>
          )}
          {!loading && data?.columns.some((c) => c.from_cache) && (
            <span className="text-xs text-slate-400">Loaded from cache</span>
          )}
          {!loading && activeSection && (
            <span className="hidden text-xs text-slate-400 sm:inline">
              Viewing: {activeSection.replace(/-/g, " ")}
            </span>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {loading && !data && (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex gap-8">
              {tickers.map((t) => (
                <div key={t} className="w-72 animate-pulse space-y-3">
                  <div className="h-12 rounded bg-slate-200" />
                  <div className="h-64 rounded bg-slate-100" />
                  <div className="h-48 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && !data && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {(showWorkspace || showPartialWorkspace) && data && availableSectionIds.size === 0 && (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="max-w-md text-center">
              <p className="text-sm font-medium text-slate-700">No sections were parsed</p>
              <p className="mt-2 text-xs text-slate-500">
                {data.columns.some((c) => c.error)
                  ? data.columns.map((c) => c.error).filter(Boolean).join(" · ")
                  : "Check that the backend is running (port 8000) and try refreshing."}
              </p>
            </div>
          </div>
        )}

        {(showWorkspace || showPartialWorkspace) && data && availableSectionIds.size > 0 && (
          <div className="flex h-full min-h-0 w-full overflow-hidden">
            <SectionNav
              availableSectionIds={availableSectionIds}
              sectionCatalog={data.section_catalog}
              activeSection={activeSection}
              onSectionSelect={handleSectionSelect}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
                <div
                  className="compare-columns-grid grid h-full min-h-0"
                  style={{
                    gridTemplateColumns: `repeat(${tickers.length}, minmax(360px, 1fr))`,
                    minWidth: `${tickers.length * 360}px`,
                  }}
                >
                  {tickers.map((ticker) => {
                    const col = data.columns.find((c) => c.ticker === ticker);
                    if (!col) {
                      return (
                        <div
                          key={ticker}
                          className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50"
                        >
                          <div className="border-b border-slate-200 px-4 py-3">
                            <p className="font-mono text-sm font-semibold text-slate-900">{ticker}</p>
                            <p className="text-xs text-slate-400">Loading…</p>
                          </div>
                          <div className="flex flex-1 items-center justify-center">
                            <div className="h-48 w-full max-w-xs animate-pulse rounded bg-slate-200" />
                          </div>
                        </div>
                      );
                    }
                    return (
                      <FilingColumnComponent
                        key={col.ticker}
                        ticker={col.ticker}
                        companyName={col.company_name}
                        form={col.form}
                        filingDate={col.filing_date}
                        fiscalYear={col.fiscal_year}
                        cacheKey={col.cache_key ?? null}
                        sections={col.sections}
                        activeSection={activeSection}
                        sectionLabel={activeSectionLabel}
                        error={col.error}
                        financialsXbrl={financialsByTicker[col.ticker] ?? null}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <PaywallModal
        open={paywall.open}
        reason={paywall.reason}
        message={paywall.message}
        onClose={() => setPaywall({ ...paywall, open: false })}
      />
    </div>
  );
}
