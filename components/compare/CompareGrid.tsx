"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  checkApiHealth,
  fetchFinancials,
  fetchFinancialsBatch,
  parseFilingsStream,
  prefetchAuthToken,
  type FinancialsXbrl,
  type FilingColumn,
  type ParseResponse,
} from "@/lib/api";
import {
  GAAP_STATEMENT_SECTION_IDS,
  getComparableSectionIds,
  mergeProStatementCatalog,
  resolveDefaultActiveSection,
  DEFAULT_ACTIVE_SECTION,
  FINANCIALS_BOOTSTRAP_CATALOG,
} from "@/lib/sections";
import { hasSectionIndex, loadParseMeta, parseMetaCacheKey, saveParseMeta, saveParseMetaDraft } from "@/lib/parse-cache";
import { resolveFilingUrl } from "@/lib/sec-url";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveTier } from "@/hooks/useEffectiveTier";
import { compareUrlLimitMessage } from "@/lib/tier-limits";
import { isDevTierToggleEnabled } from "@/lib/dev-tier";
import ApiHealthBanner from "../ApiHealthBanner";
import FilingColumnComponent from "./FilingColumn";
import SectionNav from "./SectionNav";
import FilingPeriodPicker from "./FilingPeriodPicker";
import { fiscalYearFromPeriod, type ComparePeriod } from "@/lib/filing-period";
import PeerGroupsMenu from "./PeerGroupsMenu";
import PaywallModal from "../billing/PaywallModal";
import TickerSearchBar from "../TickerSearchBar";
import DevTierToggle from "../DevTierToggle";
import { getCompareColumnLayout, compareGridTemplateColumns } from "@/lib/compare-layout";

interface CompareGridProps {
  tickers: string[];
  fiscalYear?: number;
  period?: string;
  slugError?: string | null;
}

export default function CompareGrid({ tickers, fiscalYear, period, slugError }: CompareGridProps) {
  const comparePeriod = useMemo<ComparePeriod>(
    () => ({ fiscalYear, period }),
    [fiscalYear, period]
  );
  const resolvedFiscalYear = useMemo(
    () => fiscalYearFromPeriod(period, fiscalYear),
    [period, fiscalYear]
  );
  const cacheKey = useMemo(
    () => parseMetaCacheKey(tickers, comparePeriod),
    [tickers, comparePeriod]
  );
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
  const { auth, loading: authLoading, refresh: refreshAuth, isSignedIn, configured } = useAuth();
  const { tier, isPro, maxColumns } = useEffectiveTier(auth);
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [sectionsParseError, setSectionsParseError] = useState("");
  const [financialsByTicker, setFinancialsByTicker] = useState<Record<string, FinancialsXbrl>>({});
  const [financialsErrors, setFinancialsErrors] = useState<Record<string, string>>({});
  const loadIdRef = useRef(0);
  const upgradedFullFinancialsRef = useRef(new Set<string>());

  const columnLayout = useMemo(() => getCompareColumnLayout(tickers.length), [tickers.length]);

  const buildPlaceholderColumn = useCallback(
    (ticker: string, fin?: FinancialsXbrl): FilingColumn => ({
      ticker,
      company_name: fin?.entity_name ?? ticker,
      cik: fin?.cik ?? "",
      form: null,
      filing_date: null,
      report_date: null,
      fiscal_year: resolvedFiscalYear ?? null,
      sections: [],
      error: null,
    }),
    [resolvedFiscalYear]
  );

  useEffect(() => {
    prefetchAuthToken();
    checkApiHealth().then(setApiHealthy);
  }, []);

  useEffect(() => {
    if (isPro && paywall.open) {
      setPaywall((p) => ({ ...p, open: false }));
    }
  }, [isPro, paywall.open]);

  useEffect(() => {
    if (!slugError) return;
    setLoadingFinancials(false);
    setError("");
  }, [slugError]);

  const maxColumnsResolved = maxColumns;

  const overColumnLimit = tickers.length > maxColumnsResolved;

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
    const hasFullCatalog = data.section_catalog.length > FINANCIALS_BOOTSTRAP_CATALOG.length;
    if (ids.size === 0 && hasFullCatalog) {
      for (const s of data.section_catalog) ids.add(s.id);
    } else if (ids.size === 0 && isBootstrapMode) {
      ids.add(DEFAULT_ACTIVE_SECTION);
    }
    if (isPro) {
      GAAP_STATEMENT_SECTION_IDS.forEach((id) => ids.add(id));
    }
    return ids;
  }, [data, isBootstrapMode, isPro]);

  const navigableCatalog = useMemo(() => {
    if (!data) return FINANCIALS_BOOTSTRAP_CATALOG;
    return mergeProStatementCatalog(data.section_catalog, isPro);
  }, [data, isPro]);

  const upgradeFullFinancials = useCallback(
    (ticker: string) => {
      const upper = ticker.toUpperCase();
      if (upgradedFullFinancialsRef.current.has(upper)) return;
      upgradedFullFinancialsRef.current.add(upper);
      void fetchFinancials(ticker, resolvedFiscalYear, { headlineOnly: false, period })
        .then((full) => {
          setFinancialsByTicker((prev) => ({ ...prev, [upper]: full }));
          setFinancialsErrors((prev) => {
            if (!(upper in prev)) return prev;
            const next = { ...prev };
            delete next[upper];
            return next;
          });
        })
        .catch((err) => {
          upgradedFullFinancialsRef.current.delete(upper);
          const message = err instanceof Error ? err.message : "Failed to load financials";
          setFinancialsErrors((prev) => ({ ...prev, [upper]: message }));
        });
    },
    [resolvedFiscalYear, period]
  );

  useEffect(() => {
    if (!activeSection?.startsWith("note-")) return;
    for (const ticker of tickers) {
      const upper = ticker.toUpperCase();
      const fin = financialsByTicker[upper];
      if (!fin) continue;
      const hasNotes = fin.notes_xbrl && Object.keys(fin.notes_xbrl).length > 0;
      if (!hasNotes) upgradeFullFinancials(upper);
    }
  }, [activeSection, tickers, financialsByTicker, upgradeFullFinancials]);

  const loadFilings = useCallback(() => {
    const loadId = ++loadIdRef.current;
    upgradedFullFinancialsRef.current = new Set();
    setActiveSection(DEFAULT_ACTIVE_SECTION);
    setError("");
    setSectionsParseError("");
    setFinancialsByTicker({});
    setFinancialsErrors({});
    setLoadingTickers(tickers);
    setLoadingSections(false);
    setLoadingFinancials(true);

    let anyFinancials = false;

    const mergeColumnHeader = (existing: FilingColumn, incoming: FilingColumn): FilingColumn => ({
      ...existing,
      ...incoming,
      sections: existing.sections.length > 0 ? existing.sections : incoming.sections,
    });

    const applyColumnHeaders = (columns: FilingColumn[], incoming: FilingColumn) => {
      const idx = columns.findIndex((c) => c.ticker === incoming.ticker);
      if (idx >= 0) columns[idx] = mergeColumnHeader(columns[idx], incoming);
      else columns.push(incoming);
    };

    const applyHeadlineFinancial = (ticker: string, fin: FinancialsXbrl) => {
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

    const startHeadlineFinancials = () => {
      void fetchFinancialsBatch(tickers, resolvedFiscalYear, { headlineOnly: true, period }, {
        onFinancial: (ticker, fin) => {
          if (loadId !== loadIdRef.current) return;
          applyHeadlineFinancial(ticker, fin);
        },
        onError: (ticker, message) => {
          if (loadId !== loadIdRef.current) return;
          setFinancialsErrors((prev) => ({ ...prev, [ticker]: message }));
          setLoadingTickers((pending) => pending.filter((t) => t !== ticker));
        },
        onDone: () => {
          if (loadId === loadIdRef.current) setLoadingFinancials(false);
        },
      }).catch((err) => {
        if (loadId !== loadIdRef.current) return;
        const message = err instanceof Error ? err.message : "Failed to load financials";
        setFinancialsErrors(
          Object.fromEntries(tickers.map((t) => [t.toUpperCase(), message]))
        );
        setLoadingTickers([]);
        setLoadingFinancials(false);
      });
    };

    const cached = loadParseMeta(cacheKey, period);
    if (cached && hasSectionIndex(cached)) {
      setData(cached);
      setActiveSection(resolveDefaultActiveSection(getComparableSectionIds(cached.columns)));
      startHeadlineFinancials();
      return;
    }

    setData({
      columns: tickers.map((t) => buildPlaceholderColumn(t)),
      section_catalog: FINANCIALS_BOOTSTRAP_CATALOG,
      parsed_at: new Date().toISOString(),
      stateless: false,
    });

    void (async () => {
      const columns: FilingColumn[] = tickers.map((t) => buildPlaceholderColumn(t));
      let sectionCatalog: ParseResponse["section_catalog"] = FINANCIALS_BOOTSTRAP_CATALOG;

      setLoadingSections(true);
      startHeadlineFinancials();

      try {
        await parseFilingsStream(tickers, resolvedFiscalYear, {
          onCatalog: (sectionCatalogIn, at) => {
            if (loadId !== loadIdRef.current) return;
            sectionCatalog = sectionCatalogIn;
            setData((prev) =>
              prev ? { ...prev, section_catalog: sectionCatalogIn, parsed_at: at } : prev
            );
          },
          onColumnMeta: (column) => {
            if (loadId !== loadIdRef.current) return;
            applyColumnHeaders(columns, column);
            setData((prev) => {
              if (!prev) return prev;
              const next = {
                ...prev,
                columns: [...columns],
                section_catalog: sectionCatalog.length > 0 ? sectionCatalog : prev.section_catalog,
              };
              saveParseMetaDraft(cacheKey, next);
              return next;
            });
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
        }, period);
      } catch (err) {
        if (loadId !== loadIdRef.current) return;
        if (err instanceof ApiError && err.isPaywall) {
          const detail = err.detail as { reason?: string; message?: string };
          const reason = detail.reason || "subscription_required";
          const message = detail.message || "Upgrade to Professional to continue.";
          if (!isPro) {
            setPaywall({ open: true, reason, message });
            if (reason === "column_limit") {
              setSectionsParseError(message);
            }
          } else if (reason === "column_limit") {
            setSectionsParseError(
              "Filing sections could not load for all tickers. Restart the API via start.bat so ALLOW_DEV_TIER_TOGGLE is enabled, or sign in with a Professional subscription."
            );
          }
        } else if (!anyFinancials) {
          setError(err instanceof Error ? err.message : "Failed to load filings");
          setData(null);
        } else {
          setSectionsParseError(
            err instanceof Error ? err.message : "Filing sections could not be loaded."
          );
        }
        setLoadingTickers([]);
        setLoadingFinancials(false);
      } finally {
        if (loadId === loadIdRef.current) {
          setLoadingSections(false);
        }
      }
    })();
  }, [buildPlaceholderColumn, cacheKey, tickers, resolvedFiscalYear, period, isPro]);

  useEffect(() => {
    if (slugError || authLoading) return;
    if (overColumnLimit) {
      const message = compareUrlLimitMessage(tier, maxColumnsResolved, tickers.length);
      if (!isPro) {
        setPaywall({ open: true, reason: "column_limit", message });
        setSectionsParseError(message);
      }
      setData(null);
      setLoadingFinancials(false);
      setLoadingSections(false);
      setLoadingTickers([]);
      return;
    }
    loadFilings();
  }, [loadFilings, slugError, authLoading, overColumnLimit, tier, maxColumnsResolved, tickers.length, isPro]);

  const handleSectionSelect = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
  }, []);

  const handlePaywall = useCallback(
    (reason: string, message: string) => {
      if (isPro) return;
      setPaywall({ open: true, reason, message });
    },
    [isPro]
  );

  const activeSectionLabel = useMemo(() => {
    if (!activeSection) return null;
    return navigableCatalog.find((s) => s.id === activeSection)?.label ?? null;
  }, [navigableCatalog, activeSection]);

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
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden">
      <ApiHealthBanner healthy={apiHealthy} />
      <div className="relative z-30 flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <TickerSearchBar
          initialTickers={tickers}
          compact
          fiscalYear={fiscalYear}
          period={period}
          onPaywall={handlePaywall}
        />
        <FilingPeriodPicker
          tickers={tickers}
          fiscalYear={fiscalYear}
          period={period}
          tier={tier}
          onPaywall={handlePaywall}
        />
        <PeerGroupsMenu
          tickers={tickers}
          fiscalYear={fiscalYear}
          tier={tier}
          isSignedIn={isSignedIn}
          authConfigured={configured}
          onPaywall={handlePaywall}
        />
        <div className="ml-auto flex items-center gap-3">
          <DevTierToggle
            currentTier={tier}
            onChange={() => {
              void refreshAuth();
            }}
          />
          {tier === "professional" ? (
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
              Professional
            </span>
          ) : isDevTierToggleEnabled() ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              Free
            </span>
          ) : null}
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
        {overColumnLimit && (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="max-w-md text-center">
              <p className="text-sm font-medium text-slate-800">Too many tickers for your plan</p>
              <p className="mt-2 text-sm text-slate-600">
                {compareUrlLimitMessage(tier, maxColumnsResolved, tickers.length)}
              </p>
            </div>
          </div>
        )}

        {error && !data && !overColumnLimit && (
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

        {canShowCompare && data && availableSectionIds.size > 0 && !overColumnLimit && (
          <div className="flex h-full min-h-0 w-full overflow-hidden">
            <SectionNav
              availableSectionIds={availableSectionIds}
              sectionCatalog={navigableCatalog}
              activeSection={activeSection}
              onSectionSelect={handleSectionSelect}
              isPro={isPro}
              mobileOpen={navOpen}
              onMobileClose={() => setNavOpen(false)}
            />
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {sectionsParseError && (
                <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                  {sectionsParseError}
                </div>
              )}
              <button
                type="button"
                onClick={() => setNavOpen(true)}
                className="absolute bottom-4 left-4 z-10 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-md md:hidden"
              >
                Sections
              </button>
              <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
                <div
                  className={`compare-columns-grid grid h-full min-h-0${
                    columnLayout.fixedColumns ? " compare-columns-grid--fixed" : ""
                  }`}
                  style={{
                    gridTemplateColumns: compareGridTemplateColumns(tickers.length, columnLayout),
                    minWidth: `${tickers.length * columnLayout.minWidth}px`,
                  }}
                >
                  {tickers.map((ticker) => {
                    const col = data.columns.find((c) => c.ticker === ticker);
                    if (!col) {
                      return (
                        <div
                          key={ticker}
                          className="compare-column flex min-h-0 flex-col border-r border-slate-200 bg-slate-50"
                          style={
                            columnLayout.fixedColumns
                              ? { minWidth: columnLayout.minWidth, maxWidth: columnLayout.minWidth }
                              : undefined
                          }
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
                        period={period}
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
                        financialsError={financialsErrors[col.ticker] ?? null}
                        sectionsPending={loadingSections && col.sections.length === 0}
                        columnCount={tickers.length}
                        columnLayout={columnLayout}
                        fiscalYearFilter={resolvedFiscalYear ?? col.fiscal_year}
                        isPro={isPro}
                        onPaywall={handlePaywall}
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
