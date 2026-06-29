"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ApiError,
  fetchFinancials,
  fetchFinancialsBatch,
  parseFilingsStream,
  prefetchAuthToken,
  type FinancialsXbrl,
  type FilingColumn,
  type ParseResponse,
} from "@/lib/api";
import { waitForApiReady } from "@/lib/api-warmup";
import {
  GAAP_STATEMENT_SECTION_IDS,
  getComparableSectionIds,
  mergeProStatementCatalog,
  resolveDefaultActiveSection,
  DEFAULT_ACTIVE_SECTION,
  FINANCIALS_BOOTSTRAP_CATALOG,
} from "@/lib/sections";
import {
  clearParseMeta,
  clearColumnSectionCaches,
  hasSectionIndex,
  isRetriableParseError,
  loadParseMeta,
  parseMetaCacheKey,
  saveParseMeta,
  saveParseMetaDraft,
} from "@/lib/parse-cache";
import { resolveFilingUrl } from "@/lib/sec-url";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveTier } from "@/hooks/useEffectiveTier";
import { compareUrlLimitMessage } from "@/lib/tier-limits";
import { isDevTierToggleEnabled, shouldShowDevTierUI } from "@/lib/dev-tier";
import { apiUnreachableHint, isLocalDevHost } from "@/lib/api-environment";
import ApiHealthBanner from "../ApiHealthBanner";
import FilingColumnComponent from "./FilingColumn";
import SectionNav from "./SectionNav";
import FilingPeriodPicker from "./FilingPeriodPicker";
import { fiscalYearFromPeriod, formFromPeriodId, type ComparePeriod } from "@/lib/filing-period";
import PeerGroupsMenu from "./PeerGroupsMenu";
import PaywallModal from "../billing/PaywallModal";
import TickerSearchBar from "../TickerSearchBar";
import DevTierToggle from "../DevTierToggle";
import { getCompareColumnLayout, compareGridTemplateColumns } from "@/lib/compare-layout";
import { scanDeltas, foreignFilerTooltip } from "@/lib/delta-engine";
import {
  MAINSTREAM_STRIP_CAP,
  MAINSTREAM_STRIP_TAGLINE,
  countMainstreamFlagsByTicker,
  countMainstreamStripFlags,
  filterMapWorthyFlags,
  mapWorthyCoverage,
  rankMainstreamStrip,
} from "@/lib/delta-surface";
import type { DeltaFlag } from "@/lib/delta-types";
import DeltaReportLinkBar from "./DeltaReportLinkBar";
import { deltaReportPath } from "@/lib/delta-report";
import {
  bumpScrollGeneration,
  resetCompareViewScroll,
  resetCompareViewScrollWhenReady,
  resetAllFilingColumnScrollsExcept,
} from "@/lib/filing-column-scroll";
import { isMetricFocusDeltaFlag } from "@/lib/delta-labels";

interface CompareGridProps {
  peerSlug: string;
  tickers: string[];
  fiscalYear?: number;
  period?: string;
  slugError?: string | null;
}

export default function CompareGrid({ peerSlug, tickers, fiscalYear, period, slugError }: CompareGridProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [apiWarmupDone, setApiWarmupDone] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [sectionsParseError, setSectionsParseError] = useState("");
  const [financialsByTicker, setFinancialsByTicker] = useState<Record<string, FinancialsXbrl>>({});
  const [financialsErrors, setFinancialsErrors] = useState<Record<string, string>>({});
  const loadIdRef = useRef(0);
  const compareLoadKeyRef = useRef<string | null>(null);
  const isProRef = useRef(false);
  isProRef.current = isPro;
  const upgradedFullFinancialsRef = useRef(new Set<string>());
  const notesRetriedAfterParseRef = useRef(new Set<string>());
  const [upgradingNotesTickers, setUpgradingNotesTickers] = useState<Set<string>>(new Set());
  const [mixedFilerBannerDismissed, setMixedFilerBannerDismissed] = useState(false);
  const focusHandledRef = useRef(false);
  const [sectionScrollRequest, setSectionScrollRequest] = useState(0);
  const [sectionFocusTicker, setSectionFocusTicker] = useState<string | null>(null);
  const [sectionFocusRowKey, setSectionFocusRowKey] = useState<string | null>(null);
  const columnsScrollRef = useRef<HTMLDivElement>(null);

  const scrollTickerColumnIntoView = useCallback((ticker: string): boolean => {
    const container = columnsScrollRef.current;
    if (!container) return false;
    const column = container.querySelector<HTMLElement>(
      `[data-compare-ticker="${ticker.toUpperCase()}"]`
    );
    if (!column || column.offsetWidth < 1) return false;

    const colLeft = column.offsetLeft;
    const colRight = colLeft + column.offsetWidth;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + container.clientWidth;
    if (colLeft < viewLeft) {
      container.scrollLeft = colLeft;
    } else if (colRight > viewRight) {
      container.scrollLeft = colRight - container.clientWidth;
    }
    return true;
  }, []);

  const scrollTickerColumnIntoViewWhenReady = useCallback(
    (ticker: string) => {
      let attempts = 0;
      const tryScroll = () => {
        if (scrollTickerColumnIntoView(ticker) || attempts >= 12) return;
        attempts += 1;
        requestAnimationFrame(tryScroll);
      };
      requestAnimationFrame(tryScroll);
    },
    [scrollTickerColumnIntoView]
  );

  const handleSectionSelect = useCallback(
    (sectionId: string, focusTicker?: string, rowKey?: string) => {
      const metricFocus = Boolean(rowKey);
      bumpScrollGeneration();
      const normalizedFocusTicker = focusTicker?.toUpperCase() ?? null;
      if (metricFocus && normalizedFocusTicker) {
        resetAllFilingColumnScrollsExcept(normalizedFocusTicker);
      } else {
        setSectionFocusTicker(null);
        setSectionFocusRowKey(null);
        resetCompareViewScroll();
      }
      setActiveSection(sectionId);
      if (!metricFocus) {
        setSectionScrollRequest((n) => n + 1);
      }
      if (metricFocus) {
        setSectionFocusTicker(normalizedFocusTicker);
        setSectionFocusRowKey(rowKey ?? null);
      }
      if (normalizedFocusTicker) {
        scrollTickerColumnIntoViewWhenReady(normalizedFocusTicker);
      }
      if (!metricFocus) {
        requestAnimationFrame(() => resetCompareViewScrollWhenReady());
      }
    },
    [scrollTickerColumnIntoViewWhenReady]
  );

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
    const ac = new AbortController();
    void (async () => {
      const ok = await waitForApiReady({ signal: ac.signal });
      if (ac.signal.aborted) return;
      setApiHealthy(ok);
      setApiWarmupDone(true);
    })();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (isPro && paywall.open) {
      setPaywall((p) => ({ ...p, open: false }));
    }
    if (isPro) {
      setSectionsParseError((msg) =>
        msg.includes("Free tier supports") || msg.includes("Upgrade to Professional") ? "" : msg
      );
    }
  }, [isPro, paywall.open]);

  useEffect(() => {
    if (!slugError) return;
    setLoadingFinancials(false);
    setError("");
  }, [slugError]);

  const tierResolved = !authLoading;
  const maxColumnsResolved = maxColumns;
  const columnLimitExceeded = tierResolved && tickers.length > maxColumnsResolved;

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
      setUpgradingNotesTickers((prev) => new Set(prev).add(upper));
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
        })
        .finally(() => {
          setUpgradingNotesTickers((prev) => {
            const next = new Set(prev);
            next.delete(upper);
            return next;
          });
        });
    },
    [resolvedFiscalYear, period]
  );

  useEffect(() => {
    if (loadingFinancials) return;
    for (const ticker of tickers) {
      const upper = ticker.toUpperCase();
      const fin = financialsByTicker[upper];
      if (!fin) continue;
      if (fin.headline_only === false) continue;
      const notes = fin.notes_xbrl;
      const hasNotes = notes && Object.keys(notes).length > 0;
      if (hasNotes) continue;
      upgradeFullFinancials(upper);
    }
  }, [tickers, financialsByTicker, loadingFinancials, upgradeFullFinancials]);

  useEffect(() => {
    if (!activeSection?.startsWith("note-")) return;
    for (const ticker of tickers) {
      const upper = ticker.toUpperCase();
      const fin = financialsByTicker[upper];
      if (!fin) continue;
      const notes = fin.notes_xbrl;
      const hasNotes = notes && Object.keys(notes).length > 0;
      if (!hasNotes) upgradeFullFinancials(upper);
    }
  }, [activeSection, tickers, financialsByTicker, upgradeFullFinancials]);

  useEffect(() => {
    if (loadingSections || !activeSection?.startsWith("note-")) return;
    for (const ticker of tickers) {
      const upper = ticker.toUpperCase();
      if (notesRetriedAfterParseRef.current.has(upper)) continue;
      const fin = financialsByTicker[upper];
      const notes = fin?.notes_xbrl;
      if (!notes || Object.keys(notes).length === 0) continue;
      const disclosureCount = Object.values(notes).reduce(
        (count, note) => count + (note.disclosures?.length ?? 0),
        0
      );
      if (disclosureCount > 0) continue;
      notesRetriedAfterParseRef.current.add(upper);
      upgradedFullFinancialsRef.current.delete(upper);
      upgradeFullFinancials(upper);
    }
  }, [
    loadingSections,
    activeSection,
    tickers,
    financialsByTicker,
    upgradeFullFinancials,
  ]);

  const loadFilings = useCallback((options?: { refreshTickers?: string[] }) => {
    const loadId = ++loadIdRef.current;
    upgradedFullFinancialsRef.current = new Set();
    notesRetriedAfterParseRef.current = new Set();
    setUpgradingNotesTickers(new Set());
    setMixedFilerBannerDismissed(false);
    focusHandledRef.current = false;
    setSectionFocusTicker(null);
    setSectionFocusRowKey(null);
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
          if (loadId !== loadIdRef.current) return;
          setLoadingFinancials(false);
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
              return {
                ...prev,
                columns: [...columns],
                section_catalog: sectionCatalog.length > 0 ? sectionCatalog : prev.section_catalog,
              };
            });
            if (sectionCatalog.length > 0 || columns.some((c) => c.form)) {
              saveParseMetaDraft(cacheKey, {
                columns: [...columns],
                section_catalog: sectionCatalog,
                parsed_at: new Date().toISOString(),
                stateless: false,
              });
            }
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
        }, period, {
          refreshTickers: options?.refreshTickers,
        });
      } catch (err) {
        if (loadId !== loadIdRef.current) return;
        if (err instanceof ApiError && err.isPaywall) {
          const detail = err.detail as { reason?: string; message?: string };
          const reason = detail.reason || "subscription_required";
          const message = detail.message || "Upgrade to Professional to continue.";
          if (!isProRef.current) {
            setPaywall({ open: true, reason, message });
            if (reason === "column_limit") {
              setSectionsParseError(message);
            }
          } else if (reason === "column_limit") {
            setSectionsParseError(
              isLocalDevHost()
                ? "Filing sections could not load for all tickers. Restart the API via start.bat so ALLOW_DEV_TIER_TOGGLE is enabled, or sign in with a Professional subscription."
                : "Filing sections could not load for all tickers. Sign in with a Professional subscription to compare more tickers."
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
  }, [buildPlaceholderColumn, cacheKey, tickers, resolvedFiscalYear, period]);

  // Free tier allows 3 columns — start SEC fetch before /auth/me returns to avoid a serial waterfall.
  const canLoadBeforeAuth = tickers.length <= 3;
  const deferredFinancialsByTicker = useDeferredValue(financialsByTicker);

  useEffect(() => {
    if (!apiWarmupDone) return;
    if (slugError) {
      compareLoadKeyRef.current = null;
      return;
    }
    if (authLoading && !canLoadBeforeAuth) return;
    if (columnLimitExceeded) {
      compareLoadKeyRef.current = null;
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
    // Avoid restarting parse/financials when auth resolves after an early ≤3-column load.
    if (compareLoadKeyRef.current === cacheKey) return;
    compareLoadKeyRef.current = cacheKey;
    loadFilings();
  }, [
    loadFilings,
    cacheKey,
    apiWarmupDone,
    slugError,
    authLoading,
    canLoadBeforeAuth,
    columnLimitExceeded,
    tier,
    maxColumnsResolved,
    tickers.length,
    isPro,
  ]);

  const deltaScan = useMemo(() => {
    if (!data || tickers.length === 0) return null;
    return scanDeltas({
      tickers,
      columns: data.columns,
      catalog: navigableCatalog,
      financialsByTicker: deferredFinancialsByTicker,
      financialsErrors,
      fiscalYear: resolvedFiscalYear ?? null,
      period,
      isPro,
    });
  }, [
    data,
    tickers,
    navigableCatalog,
    deferredFinancialsByTicker,
    financialsErrors,
    resolvedFiscalYear,
    period,
    isPro,
  ]);

  const columnParseErrors = useMemo(() => {
    if (!data) return [];
    return data.columns.filter((c) => c.error);
  }, [data]);

  const canRetryFailedColumns = useMemo(
    () => columnParseErrors.some((c) => isRetriableParseError(c.error)),
    [columnParseErrors]
  );

  const retryFailedColumns = useCallback(() => {
    clearParseMeta(cacheKey);
    columnParseErrors.forEach((c) => {
      if (c.cache_key) clearColumnSectionCaches(c.cache_key);
    });
    compareLoadKeyRef.current = null;
    const refreshTickers = columnParseErrors
      .filter((c) => isRetriableParseError(c.error))
      .map((c) => c.ticker);
    loadFilings({ refreshTickers });
  }, [cacheKey, columnParseErrors, loadFilings]);

  const stripFlags = useMemo(() => {
    if (!deltaScan) return [];
    return rankMainstreamStrip(deltaScan.flags, MAINSTREAM_STRIP_CAP);
  }, [deltaScan]);

  const stripTotalCount = useMemo(() => {
    if (!deltaScan) return 0;
    return countMainstreamStripFlags(deltaScan.flags);
  }, [deltaScan]);

  const mainstreamHeat = useMemo(() => {
    if (!deltaScan) return {};
    return countMainstreamFlagsByTicker(deltaScan.flags);
  }, [deltaScan]);

  const mapFlags = useMemo(() => {
    if (!deltaScan) return [];
    return filterMapWorthyFlags(deltaScan.flags);
  }, [deltaScan]);

  const mapCoverage = useMemo(() => {
    if (!deltaScan) return { flagCount: 0, sectionsWithDeltas: 0 };
    return mapWorthyCoverage(deltaScan.flags);
  }, [deltaScan]);

  const handleDeltaFlagClick = useCallback(
    (flag: DeltaFlag) => {
      const rowKey = isMetricFocusDeltaFlag(flag) ? flag.rowKey : undefined;
      handleSectionSelect(flag.sectionId, flag.ticker, rowKey);
    },
    [handleSectionSelect]
  );

  const openDeltaReport = useCallback(() => {
    router.push(deltaReportPath(peerSlug, comparePeriod));
  }, [router, peerSlug, comparePeriod]);

  const deltasSettling = useMemo(() => {
    if (!data || loadingSections || loadingFinancials) return true;
    for (const ticker of tickers) {
      const upper = ticker.toUpperCase();
      if (upgradingNotesTickers.has(upper)) return true;
      if (financialsErrors[upper]) continue;
      const fin = financialsByTicker[upper];
      if (!fin) return true;
      if (fin.headline_only !== false) {
        const notes = fin.notes_xbrl;
        const hasNotes = notes && Object.keys(notes).length > 0;
        if (!hasNotes) return true;
      }
    }
    return false;
  }, [
    data,
    loadingSections,
    loadingFinancials,
    tickers,
    financialsByTicker,
    upgradingNotesTickers,
    financialsErrors,
  ]);

  useEffect(() => {
    if (focusHandledRef.current || !data || availableSectionIds.size === 0) return;
    const section = searchParams.get("section");
    const ticker = searchParams.get("ticker");
    const row = searchParams.get("row");
    if (!section) return;
    focusHandledRef.current = true;
    handleSectionSelect(section, ticker ?? undefined, row ?? undefined);
  }, [data, availableSectionIds.size, searchParams, handleSectionSelect]);

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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ApiHealthBanner healthy={apiHealthy} warming={!apiWarmupDone} />
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
          {shouldShowDevTierUI(auth?.tier) && (
            <DevTierToggle
              authTier={auth?.tier}
              currentTier={tier}
              onChange={() => {
                void refreshAuth();
              }}
            />
          )}
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

      {canShowCompare && !columnLimitExceeded && (
        <div className="relative shrink-0 z-20">
          {deltaScan?.mixedFilerBanner && !mixedFilerBannerDismissed && (
            <div className="flex shrink-0 items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-950">
              <p className="flex-1">{deltaScan.mixedFilerBanner}</p>
              <button
                type="button"
                onClick={() => setMixedFilerBannerDismissed(true)}
                className="shrink-0 font-medium text-amber-800 hover:text-amber-900"
              >
                Dismiss
              </button>
            </div>
          )}
          <DeltaReportLinkBar
            peerSlug={peerSlug}
            tickers={tickers}
            period={comparePeriod}
            flags={mapFlags}
            scannedCount={deltaScan?.coverage.scannedSections ?? 0}
            sectionsWithDeltas={mapCoverage.sectionsWithDeltas}
            settling={deltasSettling}
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {authLoading && tickers.length > 3 && !data && (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-sm text-slate-500">Loading subscription…</p>
          </div>
        )}

        {!data && !error && !columnLimitExceeded && !(authLoading && tickers.length > 3) && (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="text-center">
              <p className="text-sm text-slate-500">
                {!apiWarmupDone ? "Connecting to filing API…" : "Loading comparison…"}
              </p>
              <div className="mx-auto mt-4 flex justify-center gap-3">
                {tickers.map((ticker) => (
                  <div
                    key={ticker}
                    className="h-32 w-24 animate-pulse rounded bg-slate-200"
                    aria-hidden
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {columnLimitExceeded && (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="max-w-md text-center">
              <p className="text-sm font-medium text-slate-800">Too many tickers for your plan</p>
              <p className="mt-2 text-sm text-slate-600">
                {compareUrlLimitMessage(tier, maxColumnsResolved, tickers.length)}
              </p>
            </div>
          </div>
        )}

        {error && !data && !columnLimitExceeded && !authLoading && (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-md text-center">
              <p className="text-sm font-medium text-red-700">Could not load filings</p>
              <p className="mt-2 text-sm text-red-600">{error}</p>
              {apiHealthy === false && (
                <p className="mt-3 text-xs text-slate-500">
                  {isLocalDevHost() ? (
                    <>
                      The API at port 8000 is not responding. Run <code className="font-mono">start.bat</code> and
                      try again.
                    </>
                  ) : (
                    apiUnreachableHint()
                  )}
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
                  : isLocalDevHost()
                    ? "Check that the backend is running (port 8000) and try refreshing."
                    : apiUnreachableHint()}
              </p>
            </div>
          </div>
        )}

        {canShowCompare && data && availableSectionIds.size > 0 && !columnLimitExceeded && (
          <div className="relative flex h-full min-h-0 w-full overflow-hidden">
            <SectionNav
              availableSectionIds={availableSectionIds}
              sectionCatalog={navigableCatalog}
              activeSection={activeSection}
              onSectionSelect={handleSectionSelect}
              isPro={isPro}
              mobileOpen={navOpen}
              onMobileClose={() => setNavOpen(false)}
              stripFlags={stripFlags}
              deltasLoading={deltasSettling}
              stripTotalCount={stripTotalCount}
              totalFlagCount={mapCoverage.flagCount}
              tagline={MAINSTREAM_STRIP_TAGLINE}
              onDeltaFlagClick={handleDeltaFlagClick}
              onViewMoreInMap={openDeltaReport}
            />
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {columnParseErrors.length > 0 && (
                <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {columnParseErrors.length === data.columns.length ? (
                        <>Could not parse filings: {columnParseErrors.map((c) => c.error).filter(Boolean).join(" · ")}</>
                      ) : (
                        <>
                          Could not parse{" "}
                          {columnParseErrors.map((c) => `${c.ticker} (${c.error ?? "unknown error"})`).join("; ")}
                          . Other tickers loaded normally
                          {canRetryFailedColumns ? " — use Retry to refetch failed columns." : " — refresh to retry failed columns."}
                        </>
                      )}
                    </span>
                    {canRetryFailedColumns && (
                      <button
                        type="button"
                        onClick={retryFailedColumns}
                        disabled={loadingSections}
                        className="shrink-0 rounded border border-red-300 bg-white px-2.5 py-1 font-sans text-[11px] font-semibold text-red-800 shadow-sm transition hover:bg-red-100 disabled:opacity-60"
                      >
                        {loadingSections ? "Retrying…" : "Retry failed columns"}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {sectionsParseError && (
                <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                  {sectionsParseError}
                </div>
              )}
              <button
                type="button"
                onClick={() => setNavOpen(true)}
                className="absolute bottom-4 left-4 z-50 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-md md:hidden"
              >
                Sections
              </button>
              <div ref={columnsScrollRef} className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
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
                        notesPending={upgradingNotesTickers.has(col.ticker)}
                        financialsError={financialsErrors[col.ticker] ?? null}
                        sectionsPending={loadingSections && col.sections.length === 0}
                        columnCount={tickers.length}
                        columnLayout={columnLayout}
                        fiscalYearFilter={resolvedFiscalYear ?? null}
                        isPro={isPro}
                        onPaywall={handlePaywall}
                        deltaFlagCount={mainstreamHeat[col.ticker] ?? 0}
                        foreignFilerTooltip={foreignFilerTooltip(col.form ?? formFromPeriodId(period))}
                        sectionScrollRequest={sectionScrollRequest}
                        metricFocusActive={sectionFocusRowKey != null}
                        focusRowKey={
                          sectionFocusTicker?.toUpperCase() === col.ticker.toUpperCase()
                            ? sectionFocusRowKey
                            : null
                        }
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
