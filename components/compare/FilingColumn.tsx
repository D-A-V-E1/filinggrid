"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchFinancialStatements,
  fetchSectionHtml,
  type FinancialStatementsXbrl,
  type FinancialsXbrl,
  type FilingSection,
  type NoteSectionXbrl,
  type StatementTable,
  type XbrlDisclosure,
} from "@/lib/api";
import { loadSectionHtml, saveSectionHtml } from "@/lib/parse-cache";
import { isNarrativeSection, isXbrlBackedSection } from "@/lib/sections";
import { buildSectionFilingUrl } from "@/lib/sec-url";
import { displayFormLabel, formFromPeriodId } from "@/lib/filing-period";
import FilingViewer from "./FilingViewer";

interface FilingColumnProps {
  ticker: string;
  companyName: string;
  form: string | null;
  period?: string;
  filingDate: string | null;
  fiscalYear: number | null;
  cacheKey: string | null;
  filingUrl: string | null;
  sections: FilingSection[];
  activeSection: string | null;
  sectionLabel: string | null;
  error: string | null;
  financialsXbrl?: FinancialsXbrl | null;
  financialsPending?: boolean;
  financialsError?: string | null;
  sectionsPending?: boolean;
  columnCount?: number;
  fiscalYearFilter?: number | null;
  isPro?: boolean;
  onPaywall?: (reason: string, message: string) => void;
}

function formatSectionLabel(label: string): string {
  return label.replace(/^Item \d+[A-Z]? — /, "").replace(/^Note — /, "");
}

function formatMetricValue(value: number, unit?: string): string {
  if (unit === "USD/shares" || unit === "pure") {
    if (Math.abs(value) < 1 && Math.abs(value) > 0) {
      return `${(value * 100).toFixed(1)}%`;
    }
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
}

const FINANCIAL_STATEMENT_ROWS: { key: string; label: string; unit?: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "net_income", label: "Net income" },
  { key: "operating_income", label: "Operating income" },
  { key: "total_assets", label: "Total assets" },
  { key: "total_liabilities", label: "Total liabilities" },
  { key: "stockholders_equity", label: "Stockholders' equity" },
  { key: "cash", label: "Cash & equivalents" },
  { key: "eps_diluted", label: "EPS (diluted)", unit: "USD/shares" },
];

function buildNoteRowMetrics(note: NoteSectionXbrl): { key: string; label: string; unit?: string }[] {
  return Object.entries(note.metrics).map(([key, metric]) => ({
    key,
    label: metric.label,
    unit: metric.unit,
  }));
}

interface XbrlPanelProps {
  rows: { key: string; label: string; unit?: string }[];
  annualSummary: Array<{ fy: number; [key: string]: number | string | undefined }>;
  fetchMs?: number;
  fromCache?: boolean;
  subtitle?: string;
  fiscalYearFilter?: number | null;
  maxFyColumns?: number;
}

/** Fewer FY columns when the compare grid is wider so tables stay readable. */
function maxFyColumnsForLayout(columnCount: number): number {
  if (columnCount >= 4) return 1;
  if (columnCount >= 3) return 2;
  return 4;
}

function pickAnnualRows(
  annualSummary: XbrlPanelProps["annualSummary"],
  fiscalYearFilter?: number | null,
  maxFyColumns = 4
): XbrlPanelProps["annualSummary"] {
  if (fiscalYearFilter != null) {
    const match = annualSummary.filter((r) => r.fy === fiscalYearFilter);
    if (match.length > 0) return match;
  }
  const sorted = [...annualSummary].sort((a, b) => b.fy - a.fy);
  return sorted.slice(0, maxFyColumns);
}

function XbrlMetricsPanel({
  rows,
  annualSummary,
  fetchMs,
  fromCache,
  subtitle,
  fiscalYearFilter,
  maxFyColumns = 4,
}: XbrlPanelProps) {
  const tableRows = pickAnnualRows(annualSummary, fiscalYearFilter, maxFyColumns);
  if (tableRows.length === 0) return null;

  const visibleRows = rows.filter(({ key }) => tableRows.some((r) => r[key] != null));
  if (visibleRows.length === 0) return null;

  return (
    <article className="mb-4 min-w-0 rounded-lg border border-brand-200 bg-brand-50/40 px-3 py-4 shadow-sm sm:px-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-sans text-[11px] font-semibold uppercase tracking-wider text-brand-800">
          SEC XBRL (fast path)
        </p>
        {fetchMs != null && (
          <span className="font-mono text-[10px] text-brand-600/80">
            {fetchMs}ms{fromCache ? " · cached" : ""}
          </span>
        )}
      </div>
      <div className="xbrl-metrics-scroll overflow-x-auto">
        <table className="xbrl-metrics-table w-max min-w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-brand-200/80">
              <th className="min-w-[7rem] max-w-[11rem] py-1.5 pr-3 font-medium text-slate-600">
                Metric
              </th>
              {tableRows.map((r) => (
                <th
                  key={r.fy}
                  className="whitespace-nowrap py-1.5 px-2 text-right font-mono font-semibold text-slate-700"
                >
                  FY {r.fy}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ key, label, unit }) => (
              <tr key={key} className="border-b border-brand-100/80 last:border-0">
                <td className="min-w-[7rem] max-w-[11rem] py-1.5 pr-3 text-slate-600">{label}</td>
                {tableRows.map((r) => {
                  const val = r[key];
                  return (
                    <td
                      key={r.fy}
                      className="whitespace-nowrap py-1.5 px-2 text-right font-mono tabular-nums text-slate-800"
                    >
                      {typeof val === "number" ? formatMetricValue(val, unit) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {subtitle && (
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{subtitle}</p>
      )}
    </article>
  );
}

type StatementTab =
  | "income_statement"
  | "balance_sheet"
  | "cash_flow"
  | "stockholders_equity";

const STATEMENT_TABS: { id: StatementTab; label: string }[] = [
  { id: "income_statement", label: "Income Statement" },
  { id: "balance_sheet", label: "Balance Sheet" },
  { id: "cash_flow", label: "Cash Flow" },
  { id: "stockholders_equity", label: "Equity" },
];

function formatPeriodLabel(period: FinancialStatementsXbrl["period"]): string {
  if (period.fp === "FY" || period.kind === "annual") {
    return period.fy != null ? `FY ${period.fy}` : "Annual";
  }
  if (period.fp && period.fy != null) {
    return `${period.fp} ${period.fy}`;
  }
  if (period.end) return period.end;
  return "Selected period";
}

function StatementRowsTable({
  table,
  periodLabel,
}: {
  table: StatementTable;
  periodLabel: string;
}) {
  if (table.rows.length === 0) {
    return <p className="text-xs text-slate-500">No line items available for this period.</p>;
  }

  return (
    <div className="xbrl-metrics-scroll overflow-x-auto">
      <table className="xbrl-metrics-table w-max min-w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-brand-200/80">
            <th className="min-w-[9rem] max-w-[14rem] py-1.5 pr-3 font-medium text-slate-600">
              Line item
            </th>
            <th className="whitespace-nowrap py-1.5 px-2 text-right font-mono font-semibold text-slate-700">
              {periodLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.key} className="border-b border-brand-100/80 last:border-0">
              <td className="min-w-[9rem] max-w-[14rem] py-1.5 pr-3 text-slate-600">{row.label}</td>
              <td className="whitespace-nowrap py-1.5 px-2 text-right font-mono tabular-nums text-slate-800">
                {formatMetricValue(row.value, row.unit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FullStatementsPanel({
  statements,
  fetchMs,
  fromCache,
}: {
  statements: FinancialStatementsXbrl;
  fetchMs?: number;
  fromCache?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<StatementTab>("income_statement");
  const periodLabel = formatPeriodLabel(statements.period);
  const activeTable = statements.statements[activeTab];

  return (
    <article className="mb-4 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-4 shadow-sm sm:px-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-sans text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Full GAAP statements
        </p>
        {fetchMs != null && (
          <span className="font-mono text-[10px] text-slate-500">
            {fetchMs}ms{fromCache ? " · cached" : ""}
          </span>
        )}
      </div>
      <div className="mb-3 flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        {STATEMENT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded px-2.5 py-1 font-sans text-[11px] font-medium transition ${
              activeTab === tab.id
                ? "bg-brand-100 text-brand-900"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <StatementRowsTable table={activeTable} periodLabel={periodLabel} />
    </article>
  );
}

function LockedStatementsPanel({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <article className="mb-4 min-w-0 rounded-lg border border-dashed border-brand-200 bg-brand-50/30 px-4 py-5 text-center shadow-sm">
      <p className="font-sans text-sm font-semibold text-slate-800">Full GAAP financial statements</p>
      <p className="mt-1 text-xs text-slate-600">
        Income Statement, Balance Sheet, Cash Flow, and Stockholders&apos; Equity with detailed line items.
      </p>
      <button
        type="button"
        onClick={onUpgrade}
        className="mt-4 inline-flex items-center rounded-md bg-brand-700 px-4 py-2 font-sans text-xs font-semibold text-white shadow-sm transition hover:bg-brand-800"
      >
        Upgrade to Professional
      </button>
    </article>
  );
}

function splitDisclosureParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);
}

function XbrlDisclosuresPanel({ disclosures }: { disclosures: XbrlDisclosure[] }) {
  if (disclosures.length === 0) return null;

  return (
    <article className="mb-4 min-w-0 rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <p className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        XBRL disclosure text
      </p>
      <div className="space-y-5">
        {disclosures.map((block) => (
          <section key={`${block.key}-${block.concept}`}>
            <h3 className="font-sans text-sm font-semibold text-slate-900">{block.label}</h3>
            <p className="mt-0.5 font-mono text-[10px] text-slate-400">{block.concept}</p>
            <div className="narrative-content mt-2">
              {splitDisclosureParagraphs(block.text).map((paragraph, i) => (
                <p key={i} className={i > 0 ? "mt-3" : undefined}>
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

function ExcerptToggleButton({
  label,
  loading,
  onClick,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="mb-3 inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-3 py-1.5 font-sans text-[11px] font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800 disabled:opacity-60"
    >
      {loading ? "Loading excerpt…" : label}
    </button>
  );
}

function HtmlExcerpt({ html }: { html: string }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-sm">
      <div
        className="filing-content prose prose-sm max-w-none font-serif text-slate-800 prose-headings:font-sans prose-headings:text-slate-900 prose-table:text-xs prose-td:px-2 prose-th:px-2 prose-th:font-semibold"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}

function FilingColumn({
  ticker,
  companyName,
  form,
  period,
  filingDate,
  fiscalYear,
  cacheKey,
  filingUrl,
  sections,
  activeSection,
  sectionLabel,
  error,
  financialsXbrl,
  financialsPending = false,
  financialsError = null,
  sectionsPending = false,
  columnCount = 1,
  fiscalYearFilter = null,
  isPro = false,
  onPaywall,
}: FilingColumnProps) {
  const maxFyColumns = maxFyColumnsForLayout(columnCount);
  const displayForm = form ?? formFromPeriodId(period);
  const formLabel = displayForm ? displayFormLabel(displayForm) : null;
  const resolvedFiscalYear =
    fiscalYearFilter ?? financialsXbrl?.fiscal_year_filter ?? fiscalYear ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sectionHtml, setSectionHtml] = useState<string | null>(null);
  const [loadingHtml, setLoadingHtml] = useState(false);
  const [showHtmlExcerpt, setShowHtmlExcerpt] = useState(false);
  const [sectionError, setSectionError] = useState("");
  const [fullStatements, setFullStatements] = useState<FinancialStatementsXbrl | null>(null);
  const [loadingStatements, setLoadingStatements] = useState(false);
  const [statementsError, setStatementsError] = useState("");

  const section = activeSection ? sections.find((s) => s.id === activeSection) : sections[0];
  const displayLabel = section
    ? formatSectionLabel(section.label)
    : sectionLabel
      ? formatSectionLabel(sectionLabel)
      : "Select a section";

  const sectionFilingUrl = useMemo(() => {
    if (!filingUrl || !activeSection || !section) return null;
    let anchor = section.anchor;
    if (!anchor && activeSection.startsWith("note-")) {
      anchor = sections.find((s) => s.id === "financial-statements")?.anchor ?? null;
    }
    return buildSectionFilingUrl(filingUrl, activeSection, anchor, section.heading);
  }, [filingUrl, activeSection, section, sections]);

  const hasXbrlData = useMemo(() => {
    if (!financialsXbrl || !activeSection || !isXbrlBackedSection(activeSection)) return false;
    if (activeSection === "financial-statements") {
      return (financialsXbrl.annual_summary?.length ?? 0) > 0;
    }
    const note = financialsXbrl.notes_xbrl?.[activeSection];
    if (!note?.has_data) return false;
    return Boolean(
      (note.annual_summary?.length ?? 0) > 0 || (note.disclosures?.length ?? 0) > 0
    );
  }, [financialsXbrl, activeSection]);

  const xbrlOnly = Boolean(activeSection && isXbrlBackedSection(activeSection) && hasXbrlData);
  const showSecViewer = Boolean(
    activeSection &&
      section &&
      (isNarrativeSection(activeSection) || (isXbrlBackedSection(activeSection) && !hasXbrlData))
  );

  const xbrlPanel = useMemo(() => {
    if (!financialsXbrl || !activeSection || !isXbrlBackedSection(activeSection)) return null;

    if (activeSection === "financial-statements") {
      const rows = financialsXbrl.annual_summary ?? [];
      if (rows.length === 0) return null;
      return (
        <XbrlMetricsPanel
          rows={FINANCIAL_STATEMENT_ROWS}
          annualSummary={rows}
          fetchMs={financialsXbrl.fetch_ms}
          fromCache={financialsXbrl.from_cache}
          subtitle="Headline GAAP metrics from SEC companyfacts."
          fiscalYearFilter={resolvedFiscalYear}
          maxFyColumns={maxFyColumns}
        />
      );
    }

    const note = financialsXbrl.notes_xbrl?.[activeSection];
    if (!note?.has_data) return null;

    const metricsPanel =
      note.annual_summary?.length ? (
        <XbrlMetricsPanel
          rows={buildNoteRowMetrics(note)}
          annualSummary={note.annual_summary}
          fetchMs={financialsXbrl.fetch_ms}
          fromCache={financialsXbrl.from_cache}
          subtitle="Tagged GAAP facts from SEC companyfacts."
          fiscalYearFilter={resolvedFiscalYear}
          maxFyColumns={maxFyColumns}
        />
      ) : null;

    const disclosuresPanel =
      note.disclosures && note.disclosures.length > 0 ? (
        <XbrlDisclosuresPanel disclosures={note.disclosures} />
      ) : null;

    if (!metricsPanel && !disclosuresPanel) return null;

    return (
      <>
        {disclosuresPanel}
        {metricsPanel}
      </>
    );
  }, [financialsXbrl, activeSection, resolvedFiscalYear, maxFyColumns]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    setShowHtmlExcerpt(false);
    setSectionHtml(null);
    setSectionError("");
  }, [activeSection, ticker]);

  useEffect(() => {
    setFullStatements(null);
    setStatementsError("");
    setLoadingStatements(false);
  }, [ticker, resolvedFiscalYear, period, isPro]);

  useEffect(() => {
    if (activeSection !== "financial-statements" || !isPro || !financialsXbrl) {
      return;
    }

    let cancelled = false;
    setLoadingStatements(true);
    setStatementsError("");

    void fetchFinancialStatements(ticker, resolvedFiscalYear, period ?? null)
      .then((data) => {
        if (!cancelled) setFullStatements(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setStatementsError(err instanceof Error ? err.message : "Failed to load statements");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingStatements(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, isPro, financialsXbrl, ticker, resolvedFiscalYear, period]);

  const handleStatementsUpgrade = useCallback(() => {
    onPaywall?.(
      "subscription_required",
      "Full GAAP financial statements require a Professional subscription."
    );
  }, [onPaywall]);

  const loadHtmlExcerpt = useCallback(() => {
    if (!activeSection || loadingHtml) return;

    if (sectionHtml) {
      setShowHtmlExcerpt(true);
      return;
    }

    if (cacheKey) {
      const cached = loadSectionHtml(cacheKey, activeSection);
      if (cached) {
        setSectionHtml(cached);
        setShowHtmlExcerpt(true);
        return;
      }
    }

    setLoadingHtml(true);
    setSectionError("");

    fetchSectionHtml(ticker, activeSection, fiscalYear)
      .then((html) => {
        if (cacheKey && html) saveSectionHtml(cacheKey, activeSection, html);
        setSectionHtml(html);
        setShowHtmlExcerpt(true);
      })
      .catch((err) => {
        setSectionError(err instanceof Error ? err.message : "Failed to load excerpt");
      })
      .finally(() => setLoadingHtml(false));
  }, [activeSection, loadingHtml, sectionHtml, cacheKey, ticker, fiscalYear]);

  const showFinancialsBootstrap =
    activeSection === "financial-statements" && (hasXbrlData || financialsPending);

  if (error) {
    return (
      <div className="compare-column flex h-full min-h-0 flex-col border-r border-slate-200 bg-white">
        <ColumnHeader ticker={ticker} companyName={companyName} form={null} filingDate={null} fiscalYear={null} />
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-center text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="compare-column flex h-full min-h-0 flex-col border-r border-slate-200 bg-slate-50/50 last:border-r-0">
      <ColumnHeader
        ticker={ticker}
        companyName={companyName}
        form={formLabel}
        filingDate={filingDate}
        fiscalYear={fiscalYear}
      />

      <div className="section-title-bar shrink-0 border-b border-slate-200 bg-white px-5 py-3">
        <p className="font-sans text-[11px] font-semibold uppercase tracking-wider text-brand-700">
          {displayLabel}
        </p>
      </div>

      <div
        ref={scrollRef}
        className="filing-column-scroll min-h-0 flex-1 overflow-y-scroll overscroll-y-contain"
      >
        <div className="compare-column-body px-5 py-5">
          {xbrlPanel}

          {activeSection === "financial-statements" && hasXbrlData && !isPro && (
            <LockedStatementsPanel onUpgrade={handleStatementsUpgrade} />
          )}

          {activeSection === "financial-statements" && isPro && financialsXbrl && (
            <>
              {loadingStatements && !fullStatements && (
                <div className="mb-4 space-y-2 rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                  <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                  <p className="text-[10px] text-slate-500">Loading full GAAP statements…</p>
                </div>
              )}
              {statementsError && !fullStatements && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-xs text-red-700">{statementsError}</p>
                </div>
              )}
              {fullStatements && (
                <FullStatementsPanel
                  statements={fullStatements}
                  fetchMs={fullStatements.fetch_ms}
                  fromCache={fullStatements.from_cache}
                />
              )}
            </>
          )}

          {financialsError && activeSection === "financial-statements" && !xbrlPanel ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4">
              <p className="text-sm font-medium text-red-800">Could not load XBRL financials</p>
              <p className="mt-1 text-xs text-red-700">{financialsError}</p>
            </div>
          ) : financialsPending && activeSection === "financial-statements" && !xbrlPanel ? (
            <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 px-5 py-5 shadow-sm">
              <div className="h-4 w-3/4 animate-pulse rounded bg-brand-200" />
              <div className="h-4 w-full animate-pulse rounded bg-brand-100" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-brand-100" />
              <p className="text-[10px] text-brand-700/70">Loading SEC XBRL financials…</p>
            </div>
          ) : sectionsPending && activeSection && activeSection !== "financial-statements" ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-sm">
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
              <p className="text-[10px] text-slate-500">Loading filing section…</p>
            </div>
          ) : !activeSection && sections.length === 0 && !showFinancialsBootstrap ? (
            <p className="text-sm text-slate-400">Select a section from the left panel.</p>
          ) : !section && !showFinancialsBootstrap ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-500">Not in this filing</p>
              <p className="mt-1 text-xs text-slate-400">
                {ticker} did not include this disclosure in the selected period.
              </p>
            </div>
          ) : showSecViewer ? (
            sectionFilingUrl ? (
              <FilingViewer filingUrl={sectionFilingUrl} sectionLabel={displayLabel} ticker={ticker} />
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center">
                <p className="text-sm text-amber-800">SEC filing link unavailable for this column.</p>
              </div>
            )
          ) : (
            <>
              {xbrlOnly && !showHtmlExcerpt && (
                <ExcerptToggleButton
                  label="View SEC filing excerpt"
                  loading={loadingHtml}
                  onClick={loadHtmlExcerpt}
                />
              )}

              {showHtmlExcerpt && sectionHtml && (
                <>
                  <p className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    SEC filing excerpt
                  </p>
                  <HtmlExcerpt html={sectionHtml} />
                </>
              )}

              {sectionError && (
                <p className="mt-2 text-xs text-red-600">{sectionError}</p>
              )}

              {xbrlOnly && !xbrlPanel && !showHtmlExcerpt && (
                <p className="text-sm text-slate-500">No XBRL metrics available for this section.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ColumnHeader({
  ticker,
  companyName,
  form,
  filingDate,
  fiscalYear,
}: {
  ticker: string;
  companyName: string;
  form: string | null;
  filingDate: string | null;
  fiscalYear: number | null;
}) {
  return (
    <header className="column-header-bar shrink-0 border-b border-slate-200 bg-white px-5 py-3">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-lg font-bold text-slate-900">{ticker}</span>
        {form && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
            {form}
          </span>
        )}
      </div>
      <p className="mt-0.5 truncate text-xs text-slate-500">{companyName}</p>
      {(filingDate || fiscalYear) && (
        <p className="mt-1 font-mono text-xs tabular-nums text-slate-400">
          {fiscalYear && `FY ${fiscalYear}`}
          {filingDate && ` · Filed ${filingDate}`}
        </p>
      )}
    </header>
  );
}

export default memo(FilingColumn);
