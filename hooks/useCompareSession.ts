"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
  getComparableSectionIds,
  mergeProStatementCatalog,
  resolveDefaultActiveSection,
  DEFAULT_ACTIVE_SECTION,
  FINANCIALS_BOOTSTRAP_CATALOG,
} from "@/lib/sections";
import { hasSectionIndex, loadParseMeta, parseMetaCacheKey, saveParseMeta, saveParseMetaDraft } from "@/lib/parse-cache";
import {
  bumpMapFlagCountFloor,
  peekCompareSession,
  saveCompareSession,
  setActiveCompareLoadKey,
  shouldSkipCompareReload,
} from "@/lib/compare-session-store";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveTier } from "@/hooks/useEffectiveTier";
import { compareUrlLimitMessage } from "@/lib/tier-limits";
import { isLocalDevHost } from "@/lib/api-environment";
import { fiscalYearFromPeriod, type ComparePeriod } from "@/lib/filing-period";
import { scanDeltas } from "@/lib/delta-engine";
import { filterMapWorthyFlags, mapWorthyCoverage } from "@/lib/delta-surface";
import { computeDeltasSettling, NOTES_UPGRADE_TIMEOUT_MS } from "@/lib/compare-settling";

export interface UseCompareSessionOptions {
  tickers: string[];
  fiscalYear?: number;
  period?: string;
  slugError?: string | null;
}

export function useCompareSession({ tickers, fiscalYear, period, slugError }: UseCompareSessionOptions) {
  const comparePeriod = useMemo<ComparePeriod>(() => ({ fiscalYear, period }), [fiscalYear, period]);
  const resolvedFiscalYear = useMemo(
    () => fiscalYearFromPeriod(period, fiscalYear),
    [period, fiscalYear]
  );
  const cacheKey = useMemo(() => parseMetaCacheKey(tickers, comparePeriod), [tickers, comparePeriod]);
  const warmSession = useMemo(() => peekCompareSession(cacheKey), [cacheKey]);

  const [data, setData] = useState<ParseResponse | null>(() => warmSession?.data ?? null);
  const [loadingFinancials, setLoadingFinancials] = useState(false);
  const [loadingTickers, setLoadingTickers] = useState<string[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [error, setError] = useState(() => warmSession?.error ?? "");
  const [sectionsParseError, setSectionsParseError] = useState(() => warmSession?.sectionsParseError ?? "");
  const [financialsByTicker, setFinancialsByTicker] = useState<Record<string, FinancialsXbrl>>(
    () => warmSession?.financialsByTicker ?? {}
  );
  const [financialsErrors, setFinancialsErrors] = useState<Record<string, string>>(
    () => warmSession?.financialsErrors ?? {}
  );
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);
  const [apiWarmupDone, setApiWarmupDone] = useState(false);
  const [paywall, setPaywall] = useState<{ open: boolean; reason: string; message: string }>({
    open: false,
    reason: "",
    message: "",
  });
  const [upgradingNotesTickers, setUpgradingNotesTickers] = useState<Set<string>>(new Set());

  const loadIdRef = useRef(0);
  const compareLoadKeyRef = useRef<string | null>(null);
  const upgradedFullFinancialsRef = useRef(new Set<string>(warmSession?.upgradedTickers ?? []));
  const notesRetriedAfterParseRef = useRef(new Set<string>());
  const notesUpgradeStartedAtRef = useRef(new Map<string, number>());
  const isProRef = useRef(false);

  const { auth, loading: authLoading, isSignedIn, configured } = useAuth();
  const { tier, isPro, maxColumns } = useEffectiveTier(auth);
  isProRef.current = isPro;

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

  const navigableCatalog = useMemo(() => {
    if (!data) return FINANCIALS_BOOTSTRAP_CATALOG;
    return mergeProStatementCatalog(data.section_catalog, isPro);
  }, [data, isPro]);

  const deferredFinancialsByTicker = useDeferredValue(financialsByTicker);

  const loadFilings = useCallback((options?: { force?: boolean }) => {
    const warm = peekCompareSession(cacheKey);
    if (
      !options?.force &&
      warm?.data &&
      hasSectionIndex(warm.data) &&
      Object.keys(warm.financialsByTicker).length > 0
    ) {
      setData(warm.data);
      setFinancialsByTicker(warm.financialsByTicker);
      setFinancialsErrors(warm.financialsErrors);
      setError(warm.error);
      setSectionsParseError(warm.sectionsParseError);
      upgradedFullFinancialsRef.current = new Set(warm.upgradedTickers);
      return;
    }

    const loadId = ++loadIdRef.current;
    upgradedFullFinancialsRef.current = new Set();
    setUpgradingNotesTickers(new Set());
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
        setFinancialsErrors(Object.fromEntries(tickers.map((t) => [t.toUpperCase(), message])));
        setLoadingTickers([]);
        setLoadingFinancials(false);
      });
    };

    const cached = loadParseMeta(cacheKey, period);
    if (cached && hasSectionIndex(cached)) {
      setData(cached);
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
          if (!isProRef.current) {
            setPaywall({ open: true, reason, message });
            if (reason === "column_limit") setSectionsParseError(message);
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

  const canLoadBeforeAuth = tickers.length <= 3;

  useEffect(() => {
    if (!apiWarmupDone) return;
    if (slugError) {
      compareLoadKeyRef.current = null;
      setActiveCompareLoadKey(null);
      return;
    }
    if (authLoading && !canLoadBeforeAuth) return;
    if (columnLimitExceeded) {
      compareLoadKeyRef.current = null;
      setActiveCompareLoadKey(null);
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
    if (compareLoadKeyRef.current === cacheKey) return;
    if (shouldSkipCompareReload(cacheKey)) {
      compareLoadKeyRef.current = cacheKey;
      loadFilings();
      return;
    }
    compareLoadKeyRef.current = cacheKey;
    setActiveCompareLoadKey(cacheKey);
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

  const upgradeFullFinancials = useCallback(
    (ticker: string) => {
      const upper = ticker.toUpperCase();
      if (upgradedFullFinancialsRef.current.has(upper)) return;
      upgradedFullFinancialsRef.current.add(upper);
      notesUpgradeStartedAtRef.current.set(upper, Date.now());
      setUpgradingNotesTickers((prev) => new Set(prev).add(upper));
      const timeoutId = window.setTimeout(() => {
        setUpgradingNotesTickers((prev) => {
          if (!prev.has(upper)) return prev;
          const next = new Set(prev);
          next.delete(upper);
          return next;
        });
      }, NOTES_UPGRADE_TIMEOUT_MS);
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
          window.clearTimeout(timeoutId);
          notesUpgradeStartedAtRef.current.delete(upper);
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
    if (loadingSections) return;
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
  }, [loadingSections, tickers, financialsByTicker, upgradeFullFinancials]);

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

  const mapFlags = useMemo(() => {
    if (!deltaScan) return [];
    return filterMapWorthyFlags(deltaScan.flags);
  }, [deltaScan]);

  const mapFlagCountFloor = useMemo(() => bumpMapFlagCountFloor(cacheKey, mapFlags.length), [cacheKey, mapFlags.length]);

  const mapCoverage = useMemo(() => {
    if (!deltaScan) return { flagCount: 0, sectionsWithDeltas: 0 };
    return mapWorthyCoverage(deltaScan.flags);
  }, [deltaScan]);

  const canShowCompare = Boolean(data && data.columns.length > 0);
  const loading = loadingFinancials || loadingSections || !apiWarmupDone;
  const financialsDeferredPending = financialsByTicker !== deferredFinancialsByTicker;

  const deltasSettling = useMemo(
    () =>
      computeDeltasSettling({
        financialsDeferredPending,
        data,
        loadingSections,
        loadingFinancials,
        loadingTickersCount: loadingTickers.length,
        tickers,
        financialsByTicker,
        financialsErrors,
        upgradingNotesTickers,
        notesUpgradeStartedAt: notesUpgradeStartedAtRef.current,
      }),
    [
      financialsDeferredPending,
      data,
      loadingSections,
      loadingFinancials,
      loadingTickers.length,
      tickers,
      financialsByTicker,
      financialsErrors,
      upgradingNotesTickers,
    ]
  );

  useEffect(() => {
    if (!data) return;
    saveCompareSession(cacheKey, {
      data,
      financialsByTicker,
      financialsErrors,
      error,
      sectionsParseError,
      upgradedTickers: Array.from(upgradedFullFinancialsRef.current),
      mapFlagCountFloor,
      settled: !deltasSettling,
    });
  }, [
    cacheKey,
    data,
    financialsByTicker,
    financialsErrors,
    error,
    sectionsParseError,
    mapFlagCountFloor,
    deltasSettling,
  ]);

  const handlePaywall = useCallback(
    (reason: string, message: string) => {
      if (isPro) return;
      setPaywall({ open: true, reason, message });
    },
    [isPro]
  );

  return {
    comparePeriod,
    resolvedFiscalYear,
    cacheKey,
    data,
    loading,
    loadingFinancials,
    loadingTickers,
    loadingSections,
    error,
    sectionsParseError,
    financialsByTicker,
    financialsErrors,
    navigableCatalog,
    deltaScan,
    mapFlags,
    mapFlagCountFloor,
    mapCoverage,
    deltasSettling,
    canShowCompare,
    columnLimitExceeded,
    apiHealthy,
    apiWarmupDone,
    authLoading,
    tier,
    isPro,
    isSignedIn,
    configured,
    paywall,
    setPaywall,
    handlePaywall,
  };
}
