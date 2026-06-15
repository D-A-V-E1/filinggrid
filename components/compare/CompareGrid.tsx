"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  checkApiHealth,
  fetchFinancials,
  parseFilingsStream,
  type FinancialsXbrl,
  type FilingColumn,
  type ParseResponse,
} from "@/lib/api";
import { getComparableSectionIds, resolveDefaultActiveSection } from "@/lib/sections";
import { hasSectionIndex, loadParseMeta, parseMetaCacheKey, saveParseMeta } from "@/lib/parse-cache";
import { resolveFilingUrl } from "@/lib/sec-url";
import { useAuth } from "@/hooks/useAuth";
import ApiHealthBanner from "../ApiHealthBanner";
import FilingColumnComponent from "./FilingColumn";
import SectionNav from "./SectionNav";
import YearPicker from "./YearPicker";
import PeerGroupsMenu from "./PeerGroupsMenu";
import PaywallModal from "../billing/PaywallModal";
import TickerSearchBar from "../TickerSearchBar";

interface CompareGridProps {
  tickers: string[];
  fiscalYear?: number;
  slugError?: string | null;
}

export default function CompareGrid({ tickers, fiscalYear, slugError }: CompareGridProps) {
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
  const { auth } = useAuth();
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [financialsByTicker, setFinancialsByTicker] = useState<Record<string, FinancialsXbrl>>({});
  const loadIdRef = useRef(0);

  const columnMinWidth = 300;

  useEffect(() => {
    if (auth?.tier) setTier(auth.tier);
  }, [auth?.tier]);

  useEffect(() => {
    checkApiHealth().then(setApiHealthy);
  }, []);

  useEffect(() => {
    if (!slugError) return;
    setLoading(false);
    setError("");
  }, [slugError]);

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
    setActiveSection(null);
    setLoading(true);
    setLoadingTickers(tickers);
    setError("");

    const cached = loadParseMeta(cacheKey);
    if (cached && hasSectionIndex(cached)) {
      setData(cached);
      setLoading(false);
      setLoadingTickers([]);
      const navigable = getComparableSectionIds(cached.columns);
      setActiveSection(resolveDefaultActiveSection(navigable));
      return;
    }

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
          if (column.sections.length > 0) {
            setLoading(false);
          }
          setData({
            columns: [...columns],
            section_catalog: catalog,
            parsed_at: parsedAt,
            stateless: false,
          });

          const navigable = getComparableSectionIds(columns);
          setActiveSection((prev) => prev ?? resolveDefaultActiveSection(navigable));
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
    if (slugError) return;
    loadFilings();
  }, [loadFilings, slugError]);

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

  const handlePaywall = useCallback((reason: string, message: string) => {
    setPaywall({ open: true, reason, message });
  }, []);

  const activeSectionLabel = useMemo(() => {
    if (!data || !activeSection) return null;
    return data.section_catalog.find((s) => s.id === activeSection)?.label ?? null;
  }, [data, activeSection]);

  const showWorkspace = data && data.columns.length > 0 && !loading;
  const showPartialWorkspace = data && data.columns.length > 0 && loading;

  if (slugError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-sm font-medium text-slate-800">Invalid comparison URL</p>
        <p className="mt-2 max-w-md text-sm text-slate-600">{slugError}</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      <ApiHealthBanner healthy={apiHealthy} />
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <TickerSearchBar initialTickers={tickers} compact fiscalYear={fiscalYear} />
        <YearPicker fiscalYear={fiscalYear} tier={tier} onPaywall={handlePaywall} />
        <PeerGroupsMenu
          tickers={tickers}
          fiscalYear={fiscalYear}
          tier={tier}
          onPaywall={handlePaywall}
        />
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
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-md text-center">
              <p className="text-sm font-medium text-red-700">Could not load filings</p>
              <p className="mt-2 text-sm text-red-600">{error}</p>
              {apiHealthy === false && (
                <p className="mt-3 text-xs text-slate-500">
                  The API at port 8000 is not responding. Run <code className="font-mono">start.bat</code>{" "}
                  and try again.
                </p>
              )}
            </div>
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
              mobileOpen={navOpen}
              onMobileClose={() => setNavOpen(false)}
            />
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <button
                type="button"
                onClick={() => setNavOpen(true)}
                className="absolute bottom-4 left-4 z-10 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-md md:hidden"
              >
                Sections
              </button>
              <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
                <div
                  className="compare-columns-grid grid h-full min-h-0"
                  style={{
                    gridTemplateColumns: `repeat(${tickers.length}, minmax(${columnMinWidth}px, 1fr))`,
                    minWidth: `${tickers.length * columnMinWidth}px`,
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
                        filingUrl={resolveFilingUrl(col)}
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
