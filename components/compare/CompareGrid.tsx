"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  checkApiHealth,
  fetchFinancialsBatch,
  parseFilingsStream,
  type FinancialsXbrl,
  type FilingColumn,
  type ParseResponse,
} from "@/lib/api";
import {
  getComparableSectionIds,
  resolveDefaultActiveSection,
  DEFAULT_ACTIVE_SECTION,
  FINANCIALS_BOOTSTRAP_CATALOG,
} from "@/lib/sections";
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
  const [loadingFinancials, setLoadingFinancials] = useState(false);
  const [loadingTickers, setLoadingTickers] = useState<string[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);
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

  const buildPlaceholderColumn = useCallback(
    (ticker: string, fin?: FinancialsXbrl): FilingColumn => ({
      ticker,
      company_name: fin?.entity_name ?? ticker,
      cik: fin?.cik ?? "",
      form: null,
      filing_date: null,
      report_date: null,
      fiscal_year: fiscalYear ?? null,
      sections: [],
      error: null,
    }),
    [fiscalYear]
  );

  useEffect(() => {
    if (auth?.tier) setTier(auth.tier);
  }, [auth?.tier]);

  useEffect(() => {
    checkApiHealth().then(setApiHealthy);
  }, []);

  useEffect(() => {
    if (!slugError) return;
    setLoadingFinancials(false);
    setError("");
  }, [slugError]);

  const isBootstrapMode = useMemo(() => {
    if (!data) return false;
    return data.columns.every((c) => c.sections.length === 0);
  }, [data]);

  const availableSectionIds = useMemo(() => {
    const ids = new Set<string>();
    if (!data) return ids;
    for (const col of data.columns) {
      for (const s of col.sections) ids.add(s.id);
    }
    if (ids.size === 0 && isBootstrapMode) {
      ids.add(DEFAULT_ACTIVE_SECTION);
    }
    return ids;
  }, [data, isBootstrapMode]);

  const loadFilings = useCallback(() => {
    const loadId = ++loadIdRef.current;
    setActiveSection(DEFAULT_ACTIVE_SECTION);
    setError("");
    setFinancialsByTicker({});
    setLoadingTickers(tickers);
    setLoadingSections(false);

    const cached = loadParseMeta(cacheKey);
    if (cached && hasSectionIndex(cached)) {
      setData(cached);
      setActiveSection(resolveDefaultActiveSection(getComparableSectionIds(cached.columns)));
      setLoadingTickers([]);
      setLoadingFinancials(false);

      void fetchFinancialsBatch(tickers, fiscalYear, { headlineOnly: false }, {
        onFinancial: (ticker, fin) => {
          if (loadId !== loadIdRef.current) return;
          setFinancialsByTicker((prev) => ({ ...prev, [ticker]: fin }));
        },
        onDone: () => undefined,
      });
      return;
    }

    setData({
      columns: tickers.map((t) => buildPlaceholderColumn(t)),
      section_catalog: FINANCIALS_BOOTSTRAP_CATALOG,
      parsed_at: new Date().toISOString(),
      stateless: false,
    });
    setLoadingFinancials(true);

    void (async () => {
      const financialsMap: Record<string, FinancialsXbrl> = {};
      let anyFinancials = false;

      const applyFinancial = (ticker: string, fin: FinancialsXbrl) => {
        financialsMap[ticker] = fin;
        anyFinancials = anyFinancials || (fin.annual_summary?.length ?? 0) > 0;
        setFinancialsByTicker((prev) => ({ ...prev, [ticker]: fin }));
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            columns: prev.columns.map((c) =>
              c.ticker === ticker
                ? {
                    ...c,
                    company_name: fin.entity_name ?? c.company_name,
                    cik: fin.cik ?? c.cik,
                  }
                : c
            ),
          };
        });
        setLoadingTickers((pending) => pending.filter((t) => t !== ticker));
        setLoadingFinancials(false);
      };

      const columns: FilingColumn[] = tickers.map((t) => buildPlaceholderColumn(t));
      let sectionCatalog: ParseResponse["section_catalog"] = FINANCIALS_BOOTSTRAP_CATALOG;

      setLoadingSections(true);

      try {
        await Promise.all([
          fetchFinancialsBatch(tickers, fiscalYear, { headlineOnly: true }, {
            onFinancial: (ticker, fin) => {
              if (loadId !== loadIdRef.current) return;
              applyFinancial(ticker, fin);
            },
            onError: (ticker) => {
              if (loadId !== loadIdRef.current) return;
              setLoadingTickers((pending) => pending.filter((t) => t !== ticker));
            },
            onDone: () => {
              if (loadId === loadIdRef.current) setLoadingFinancials(false);
            },
          }),
          parseFilingsStream(tickers, fiscalYear, {
            onCatalog: (sectionCatalogIn, at) => {
              if (loadId !== loadIdRef.current) return;
              sectionCatalog = sectionCatalogIn;
              setData((prev) =>
                prev ? { ...prev, section_catalog: sectionCatalogIn, parsed_at: at } : prev
              );
            },
            onColumn: (column) => {
              if (loadId !== loadIdRef.current) return;
              const idx = columns.findIndex((c) => c.ticker === column.ticker);
              if (idx >= 0) columns[idx] = column;
              else columns.push(column);

              setData((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  columns: [...columns],
                  section_catalog: sectionCatalog.length > 0 ? sectionCatalog : prev.section_catalog,
                };
              });
              const navigable = getComparableSectionIds(columns);
              setActiveSection((prev) => prev ?? resolveDefaultActiveSection(navigable));
            },
            onDone: () => {
              if (loadId !== loadIdRef.current) return;
              const merged: ParseResponse = {
                columns: [...columns],
                section_catalog: sectionCatalog,
                parsed_at: new Date().toISOString(),
                stateless: false,
              };
              setData(merged);
              if (hasSectionIndex(merged)) saveParseMeta(cacheKey, merged);
            },
          }),
        ]);

        if (loadId !== loadIdRef.current) return;

        void fetchFinancialsBatch(tickers, fiscalYear, { headlineOnly: false }, {
          onFinancial: (ticker, fin) => {
            if (loadId !== loadIdRef.current) return;
            setFinancialsByTicker((prev) => ({ ...prev, [ticker]: fin }));
          },
          onDone: () => undefined,
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
        } else if (!anyFinancials) {
          setError(err instanceof Error ? err.message : "Failed to load filings");
          setData(null);
        }
        setLoadingTickers([]);
        setLoadingFinancials(false);
      } finally {
        if (loadId === loadIdRef.current) {
          setLoadingSections(false);
        }
      }
    })();
  }, [buildPlaceholderColumn, cacheKey, tickers, fiscalYear]);

  useEffect(() => {
    if (slugError) return;
    loadFilings();
  }, [loadFilings, slugError]);

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

  const canShowCompare = Boolean(data && data.columns.length > 0);

  if (slugError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-sm font-medium text-slate-800">Invalid comparison URL</p>
        <p className="mt-2 max-w-md text-sm text-slate-600">{slugError}</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-x-hidden">
      <ApiHealthBanner healthy={apiHealthy} />
      <div className="relative z-30 flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
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
          {loadingFinancials && (
            <span className="text-xs text-slate-400">
              {loadingTickers.length > 0
                ? `Loading financials for ${loadingTickers.join(", ")}…`
                : "Loading financials…"}
            </span>
          )}
          {loadingSections && !loadingFinancials && (
            <span className="text-xs text-slate-400">Loading filing sections…</span>
          )}
          {!loadingFinancials && !loadingSections && data?.columns.some((c) => c.from_cache) && (
            <span className="text-xs text-slate-400">Loaded from cache</span>
          )}
          {activeSection && (
            <span className="hidden text-xs text-slate-400 sm:inline">
              Viewing: {activeSection.replace(/-/g, " ")}
            </span>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
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

        {canShowCompare && data && availableSectionIds.size === 0 && (
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

        {canShowCompare && data && availableSectionIds.size > 0 && (
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
                        financialsPending={loadingFinancials && !(col.ticker in financialsByTicker)}
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
