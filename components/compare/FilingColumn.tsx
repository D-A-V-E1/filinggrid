"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchFinancialStatements,
  ApiError,
  formatApiError,
  type FinancialStatementsXbrl,
  type FinancialsXbrl,
  type FilingSection,
  type NoteSectionXbrl,
  type StatementTable,
  type XbrlDisclosure,
} from "@/lib/api";
import { loadSectionHtml, saveSectionHtml } from "@/lib/parse-cache";
import {
  fetchSectionHtmlDeduped,
  prefetchSectionHtml,
  readCachedSectionHtml,
  type SectionHtmlRequest,
} from "@/lib/section-html";
import { isGaapStatementSection, isNarrativeSection, isXbrlBackedSection } from "@/lib/sections";
import {
  filingColumnNotFiledBody,
  filingColumnNotFiledHeading,
  resolveFilingColumnContentMode,
  shouldLoadFullGaapStatements,
} from "@/lib/filingColumnView";
import { findCatalogSection, sectionsHaveCatalogSection } from "@/lib/section-presence";
import { buildSectionFilingUrl } from "@/lib/sec-url";
import { sanitizeExcerptHtml } from "@/lib/sanitize-excerpt-html";
import { displayFormLabel, formFromPeriodId, sectionHtmlRequestParams } from "@/lib/filing-period";
import type { CompareColumnLayout } from "@/lib/compare-layout";
import {
  forwardVerticalWheelFromHorizontalScrollContainer,
  forwardVerticalWheelToFilingColumnScroll,
  attachFilingTableWheelForwarding,
} from "@/lib/forward-vertical-wheel";
import {
  getScrollGeneration,
  resetWindowScroll,
  scrollFilingColumnToTop,
  scrollMetricRowIntoViewWhenReady,
} from "@/lib/filing-column-scroll";
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
  notesPending?: boolean;
  financialsError?: string | null;
  sectionsPending?: boolean;
  columnCount?: number;
  columnLayout?: CompareColumnLayout;
  fiscalYearFilter?: number | null;
  isPro?: boolean;
  onPaywall?: (reason: string, message: string) => void;
  deltaFlagCount?: number;
  foreignFilerTooltip?: string | null;
  sectionScrollRequest?: number;
  /** When true, another column is centering on a metric row — skip window scroll reset. */
  metricFocusActive?: boolean;
  focusRowKey?: string | null;
}

function formatColumnError(error: string): string {
  if (/Compressed file ended before the end-of-stream/i.test(error)) {
    return "Filing could not be loaded (corrupted server cache). Use Retry failed columns above.";
  }
  if (/Filing cache was corrupted/i.test(error)) {
    return error;
  }
  return error;
}

function formatSectionLabel(label: string): string {
  return label.replace(/^Item \d+[A-Z]? — /, "").replace(/^Note — /, "");
}

function formatMetricValue(value: number, unit?: string): string {
  if (unit === "pure") {
    if (Math.abs(value) < 1 && Math.abs(value) > 0) {
      return `${(value * 100).toFixed(1)}%`;
    }
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (unit === "USD/shares") {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const normalized = unit?.toUpperCase();
  const prefix =
    !unit || normalized === "USD"
      ? "$"
      : normalized === "TWD"
        ? "NT$"
        : `${normalized} `;
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${prefix}${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${prefix}${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${prefix}${(value / 1e6).toFixed(1)}M`;
  return `${prefix}${value.toLocaleString()}`;
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

const FINANCIAL_STATEMENT_ROWS_DENSE: { key: string; label: string; unit?: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "net_income", label: "Net income" },
  { key: "operating_income", label: "Op. income" },
  { key: "total_assets", label: "Assets" },
  { key: "total_liabilities", label: "Liabilities" },
  { key: "stockholders_equity", label: "Equity" },
  { key: "cash", label: "Cash" },
  { key: "eps_diluted", label: "EPS (dil.)", unit: "USD/shares" },
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
  tableFit?: boolean;
  highlightRowKey?: string | null;
}

/** Fewer FY columns as the compare grid adds tickers so tables stay readable in each column. */
function maxFyColumnsForLayout(columnCount: number): number {
  if (columnCount >= 3) return 1;
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

function XbrlMetricsScroll({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={className}
      onWheel={forwardVerticalWheelFromHorizontalScrollContainer}
    >
      {children}
    </div>
  );
}

function XbrlMetricsPanel({
  rows,
  annualSummary,
  fetchMs,
  fromCache,
  subtitle,
  fiscalYearFilter,
  maxFyColumns = 4,
  tableFit = false,
  highlightRowKey = null,
}: XbrlPanelProps) {
  const tableRows = pickAnnualRows(annualSummary, fiscalYearFilter, maxFyColumns);
  if (tableRows.length === 0) return null;

  const visibleRows = rows.filter(({ key }) => tableRows.some((r) => r[key] != null));
  if (visibleRows.length === 0) return null;

  const scrollClass = tableFit ? "xbrl-metrics-scroll" : "xbrl-metrics-scroll overflow-x-auto";
  const tableClass = tableFit
    ? "xbrl-metrics-table xbrl-metrics-table--fit border-collapse text-left text-xs"
    : "xbrl-metrics-table w-max min-w-full border-collapse text-left text-xs";

  return (
    <article
      className={`mb-4 min-w-0 rounded-lg border border-brand-200 bg-brand-50/40 shadow-sm ${
        tableFit ? "px-2 py-3" : "px-3 py-4 sm:px-4"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-1">
        <p className="font-sans text-[11px] font-semibold uppercase tracking-wider text-brand-800">
          SEC XBRL (fast path)
        </p>
        {fetchMs != null && !tableFit && (
          <span className="font-mono text-[10px] text-brand-600/80">
            {fetchMs}ms{fromCache ? " · cached" : ""}
          </span>
        )}
      </div>
      <XbrlMetricsScroll className={scrollClass}>
        <table className={tableClass}>
          <thead>
            <tr className="border-b border-brand-200/80">
              <th className="xbrl-metric-line py-1.5 pr-2 font-medium text-slate-600">Metric</th>
              {tableRows.map((r) => (
                <th
                  key={r.fy}
                  className="xbrl-metric-value py-1.5 pl-1 text-right font-mono font-semibold text-slate-700"
                >
                  FY {r.fy}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ key, label, unit }) => (
              <tr
                key={key}
                data-metric-row={key}
                className={`border-b border-brand-100/80 last:border-0${
                  highlightRowKey === key ? " bg-amber-100/90 ring-1 ring-inset ring-amber-300" : ""
                }`}
              >
                <td className="xbrl-metric-line py-1.5 pr-2 text-slate-600">{label}</td>
                {tableRows.map((r) => {
                  const val = r[key];
                  return (
                    <td
                      key={r.fy}
                      className="xbrl-metric-value py-1.5 pl-1 text-right font-mono tabular-nums text-slate-800"
                    >
                      {typeof val === "number" ? formatMetricValue(val, unit) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </XbrlMetricsScroll>
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

const ALL_STATEMENT_TABS: StatementTab[] = [
  "income_statement",
  "balance_sheet",
  "cash_flow",
  "stockholders_equity",
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
  tableFit = false,
}: {
  table: StatementTable;
  periodLabel: string;
  tableFit?: boolean;
}) {
  if (table.rows.length === 0) {
    return <p className="text-xs text-slate-500">No line items available for this period.</p>;
  }

  const scrollClass = tableFit ? "xbrl-metrics-scroll" : "xbrl-metrics-scroll overflow-x-auto";
  const tableClass = tableFit
    ? "xbrl-metrics-table xbrl-metrics-table--fit border-collapse text-left text-xs"
    : "xbrl-metrics-table w-max min-w-full border-collapse text-left text-xs";

  return (
    <XbrlMetricsScroll className={scrollClass}>
      <table className={tableClass}>
        <thead>
          <tr className="border-b border-brand-200/80">
            <th className="gaap-statement-line xbrl-metric-line py-1.5 pr-2 font-medium text-slate-600">
              Line item
            </th>
            <th className="xbrl-metric-value py-1.5 pl-1 text-right font-mono font-semibold text-slate-700">
              {periodLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.key} className="border-b border-brand-100/80 last:border-0">
              <td className="gaap-statement-line xbrl-metric-line py-1.5 pr-2 text-slate-600">
                {row.label}
              </td>
              <td className="xbrl-metric-value py-1.5 pl-1 text-right font-mono tabular-nums text-slate-800">
                {formatMetricValue(row.value, row.unit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </XbrlMetricsScroll>
  );
}

function SingleStatementPanel({
  table,
  period,
  title,
  fetchMs,
  fromCache,
  tableFit = false,
}: {
  table: StatementTable;
  period: FinancialStatementsXbrl["period"];
  title: string;
  fetchMs?: number;
  fromCache?: boolean;
  tableFit?: boolean;
}) {
  const periodLabel = formatPeriodLabel(period);

  return (
    <article
      className={`gaap-statement-panel mb-4 min-w-0 rounded-lg border border-brand-200 bg-brand-50/40 shadow-sm ${
        tableFit ? "px-2 py-3" : "px-3 py-4 sm:px-4"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-sans text-[11px] font-semibold uppercase tracking-wider text-brand-800">
          {title}
        </p>
        {fetchMs != null && (
          <span className="font-mono text-[10px] text-brand-600/80">
            {fetchMs}ms{fromCache ? " · cached" : ""}
          </span>
        )}
      </div>
      <StatementRowsTable table={table} periodLabel={periodLabel} tableFit={tableFit} />
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

function disclosureLooksLikeHtml(text: string): boolean {
  return /<\s*(table|tr|div[^>]*\bfiling-table-wrap\b)/i.test(text);
}

function XbrlDisclosureBody({ text }: { text: string }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const isHtml = useMemo(() => disclosureLooksLikeHtml(text), [text]);
  const safeHtml = useMemo(
    () => (isHtml ? sanitizeExcerptHtml(text) : ""),
    [isHtml, text]
  );

  useEffect(() => {
    if (!isHtml) return;
    return attachFilingTableWheelForwarding(contentRef.current);
  }, [isHtml, safeHtml]);

  if (isHtml) {
    return (
      <div
        ref={contentRef}
        className="xbrl-disclosure-content filing-content mt-2 min-w-0 max-w-full text-xs leading-snug text-slate-800"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    );
  }

  return (
    <div className="narrative-content narrative-content--disclosure mt-2">
      {splitDisclosureParagraphs(text).map((paragraph, i) => (
        <p key={i} className={i > 0 ? "mt-2" : undefined}>
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function XbrlDisclosuresPanel({ disclosures }: { disclosures: XbrlDisclosure[] }) {
  if (disclosures.length === 0) return null;

  return (
    <article className="mb-4 min-w-0 rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <p className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        XBRL disclosure text
      </p>
      <div className="space-y-4">
        {disclosures.map((block) => (
          <section key={`${block.key}-${block.concept}`}>
            <h3 className="font-sans text-sm font-semibold text-slate-900">{block.label}</h3>
            <p className="mt-0.5 font-mono text-[10px] text-slate-400">{block.concept}</p>
            <XbrlDisclosureBody text={block.text} />
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
  onWarm,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
  onWarm?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onWarm}
      onFocus={onWarm}
      disabled={loading}
      className="mb-3 inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-3 py-1.5 font-sans text-[11px] font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800 disabled:opacity-60"
    >
      {loading ? "Loading excerpt…" : label}
    </button>
  );
}

function HtmlExcerpt({ html, compact = false }: { html: string; compact?: boolean }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const safeHtml = useMemo(() => sanitizeExcerptHtml(html), [html]);

  useEffect(() => {
    return attachFilingTableWheelForwarding(contentRef.current);
  }, [safeHtml]);

  return (
    <article
      className={`min-w-0 w-full max-w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ${
        compact ? "px-3 py-3" : "px-5 py-5"
      }`}
    >
      <div
        ref={contentRef}
        className="filing-content filing-content--excerpt w-full min-w-0 max-w-full font-serif text-sm text-slate-800"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    </article>
  );
}

function EdgarSectionLink({ filingUrl }: { filingUrl: string }) {
  return (
    <p className="mt-3">
      <a
        href={filingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-sans text-[11px] font-medium text-slate-500 transition hover:text-brand-700"
      >
        Open on EDGAR
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </a>
    </p>
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
  notesPending = false,
  financialsError = null,
  sectionsPending = false,
  columnCount = 1,
  columnLayout,
  fiscalYearFilter = null,
  isPro = false,
  onPaywall,
  deltaFlagCount = 0,
  foreignFilerTooltip = null,
  sectionScrollRequest = 0,
  metricFocusActive = false,
  focusRowKey = null,
}: FilingColumnProps) {
  const maxFyColumns = maxFyColumnsForLayout(columnCount);
  const isCompact = columnLayout?.density === "compact";
  const tableFit = isCompact || columnCount >= 2;
  const headlineMetricRows = useMemo(() => {
    const base = tableFit ? FINANCIAL_STATEMENT_ROWS_DENSE : FINANCIAL_STATEMENT_ROWS;
    const metrics = financialsXbrl?.metrics;
    if (!metrics) return base;
    return base.map((row) => ({
      ...row,
      unit: metrics[row.key]?.unit ?? row.unit,
    }));
  }, [financialsXbrl?.metrics, tableFit]);
  const xbrlMetricsSubtitle =
    financialsXbrl?.source === "sec_ixbrl_filing" ||
    financialsXbrl?.source === "sec_html_filing"
      ? "Headline metrics from the filed document (SEC companyfacts not updated yet)."
      : "Headline GAAP metrics from SEC companyfacts.";
  const displayForm = form ?? formFromPeriodId(period);
  const formLabel = displayForm ? displayFormLabel(displayForm) : null;
  const resolvedFiscalYear =
    fiscalYearFilter ?? financialsXbrl?.fiscal_year_filter ?? fiscalYear ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyTopRef = useRef<HTMLDivElement>(null);
  const activeSectionRef = useRef(activeSection);
  activeSectionRef.current = activeSection;
  const scrollResetActiveRef = useRef(false);
  const metricScrollGenerationRef = useRef(getScrollGeneration());
  const resetWindowOnColumnScroll = !metricFocusActive && !focusRowKey;
  const columnContentKey = activeSection ?? "none";
  const [sectionHtml, setSectionHtml] = useState<string | null>(null);
  const [loadingHtml, setLoadingHtml] = useState(false);
  const [showHtmlExcerpt, setShowHtmlExcerpt] = useState(false);
  const [sectionError, setSectionError] = useState("");
  const [fullStatements, setFullStatements] = useState<FinancialStatementsXbrl | null>(null);
  const [loadingStatements, setLoadingStatements] = useState(false);
  const [statementsError, setStatementsError] = useState("");

  const section = activeSection
    ? findCatalogSection(sections, activeSection)
    : sections[0];
  const hasSectionInFiling = activeSection
    ? sectionsHaveCatalogSection(sections, activeSection)
    : sections.length > 0;
  const isStatementSection = isGaapStatementSection(activeSection);
  const showFullGaapStatements = shouldLoadFullGaapStatements(
    activeSection,
    isPro,
    financialsXbrl != null
  );
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

  const gaapStatementFilingUrl = useMemo(() => {
    if (!filingUrl || !isStatementSection || !activeSection) return null;
    const finSection = sections.find((s) => s.id === "financial-statements");
    return buildSectionFilingUrl(
      filingUrl,
      activeSection,
      finSection?.anchor ?? null,
      finSection?.heading ?? null
    );
  }, [filingUrl, isStatementSection, activeSection, sections]);

  const activeStatementTable = useMemo(() => {
    if (!fullStatements || !activeSection || !isStatementSection) return null;
    return fullStatements.statements[activeSection as StatementTab] ?? null;
  }, [fullStatements, activeSection, isStatementSection]);

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

  const { showSecViewer, showExcerptToggle, xbrlOnly } = resolveFilingColumnContentMode({
    activeSection,
    hasSectionInFiling,
    hasXbrlData,
    isStatementSection,
  });

  const sectionHtmlRequest = useMemo((): SectionHtmlRequest | null => {
    if (!activeSection || !showExcerptToggle) return null;
    const compareFiscalYear = fiscalYearFilter ?? null;
    const { fiscalYear: requestFy, period: requestPeriod } = sectionHtmlRequestParams(
      period,
      compareFiscalYear
    );
    return {
      ticker,
      sectionId: activeSection,
      fiscalYear: requestFy,
      period: requestPeriod,
      filingCacheKey: cacheKey,
      sessionCacheKey: cacheKey,
    };
  }, [activeSection, showExcerptToggle, ticker, period, fiscalYearFilter, cacheKey]);

  const warmSectionHtml = useCallback(() => {
    if (sectionHtmlRequest) prefetchSectionHtml(sectionHtmlRequest);
  }, [sectionHtmlRequest]);

  const xbrlPanel = useMemo(() => {
    if (!financialsXbrl || !activeSection || !isXbrlBackedSection(activeSection)) return null;

    if (activeSection === "financial-statements") {
      const rows = financialsXbrl.annual_summary ?? [];
      if (rows.length === 0) return null;
      return (
        <XbrlMetricsPanel
          rows={headlineMetricRows}
          annualSummary={rows}
          fetchMs={financialsXbrl.fetch_ms}
          fromCache={financialsXbrl.from_cache}
          subtitle={xbrlMetricsSubtitle}
          fiscalYearFilter={resolvedFiscalYear}
          maxFyColumns={maxFyColumns}
          tableFit={tableFit}
          highlightRowKey={focusRowKey}
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
          tableFit={tableFit}
        />
      ) : null;

    const disclosuresPanel =
      note.disclosures && note.disclosures.length > 0 ? (
        <XbrlDisclosuresPanel disclosures={note.disclosures} />
      ) : null;

    if (!metricsPanel && !disclosuresPanel) return null;

    return (
      <>
        {metricsPanel}
        {disclosuresPanel}
      </>
    );
  }, [financialsXbrl, activeSection, resolvedFiscalYear, maxFyColumns, tableFit, headlineMetricRows, xbrlMetricsSubtitle, focusRowKey]);

  useEffect(() => {
    setShowHtmlExcerpt(false);
    setSectionError("");
    setLoadingHtml(false);

    if (!activeSection) {
      setSectionHtml(null);
      return;
    }

    const inline = section?.html?.trim();
    if (inline) {
      const safe = sanitizeExcerptHtml(inline);
      setSectionHtml(safe);
      if (cacheKey) saveSectionHtml(cacheKey, activeSection, safe);
      return;
    }

    if (cacheKey) {
      const cached = loadSectionHtml(cacheKey, activeSection);
      if (cached) {
        setSectionHtml(sanitizeExcerptHtml(cached));
        return;
      }
    }

    setSectionHtml(null);
  }, [activeSection, ticker, cacheKey, section?.html]);

  useLayoutEffect(() => {
    if (!focusRowKey) return;
    scrollResetActiveRef.current = false;
    const generation = getScrollGeneration();
    metricScrollGenerationRef.current = generation;
    scrollMetricRowIntoViewWhenReady(scrollRef.current, focusRowKey, 48, generation);
  }, [focusRowKey, ticker]);

  useLayoutEffect(() => {
    if (focusRowKey) {
      scrollResetActiveRef.current = false;
      const generation = getScrollGeneration();
      metricScrollGenerationRef.current = generation;
      scrollMetricRowIntoViewWhenReady(scrollRef.current, focusRowKey, 24, generation);
      return;
    }
    if (resetWindowOnColumnScroll) resetWindowScroll();
    scrollFilingColumnToTop(scrollRef.current);
    scrollResetActiveRef.current = true;
  }, [activeSection, ticker, sectionScrollRequest, focusRowKey, resetWindowOnColumnScroll]);

  useLayoutEffect(() => {
    if (!activeSection) return;
    if (focusRowKey) {
      scrollResetActiveRef.current = false;
      const generation = getScrollGeneration();
      metricScrollGenerationRef.current = generation;
      scrollMetricRowIntoViewWhenReady(scrollRef.current, focusRowKey, 24, generation);
      return;
    }
    if (resetWindowOnColumnScroll) resetWindowScroll();
    scrollFilingColumnToTop(scrollRef.current);
    scrollResetActiveRef.current = true;
  }, [
    activeSection,
    sectionsPending,
    notesPending,
    financialsPending,
    xbrlPanel,
    sectionHtml,
    showHtmlExcerpt,
    loadingHtml,
    sectionScrollRequest,
    focusRowKey,
    resetWindowOnColumnScroll,
  ]);

  useEffect(() => {
    if (!activeSection) return;
    if (focusRowKey) return;

    if (resetWindowOnColumnScroll) resetWindowScroll();
    scrollFilingColumnToTop(scrollRef.current);
    const t50 = window.setTimeout(() => scrollFilingColumnToTop(scrollRef.current), 50);
    const t300 = window.setTimeout(() => scrollFilingColumnToTop(scrollRef.current), 300);
    const t1000 = window.setTimeout(() => scrollFilingColumnToTop(scrollRef.current), 1000);

    return () => {
      window.clearTimeout(t50);
      window.clearTimeout(t300);
      window.clearTimeout(t1000);
    };
  }, [
    activeSection,
    sectionsPending,
    notesPending,
    financialsPending,
    sectionHtml,
    showHtmlExcerpt,
    loadingHtml,
    sectionScrollRequest,
    focusRowKey,
    resetWindowOnColumnScroll,
  ]);

  useEffect(() => {
    if (focusRowKey) {
      scrollResetActiveRef.current = false;
      return;
    }
    scrollResetActiveRef.current = true;
    const scrollEl = scrollRef.current;
    const bodyEl = bodyTopRef.current;
    if (!scrollEl || !bodyEl) return;

    const observer = new ResizeObserver(() => {
      if (!scrollResetActiveRef.current) return;
      scrollFilingColumnToTop(scrollEl);
    });
    observer.observe(bodyEl);

    const stop = window.setTimeout(() => {
      scrollResetActiveRef.current = false;
    }, 2500);

    return () => {
      observer.disconnect();
      window.clearTimeout(stop);
    };
  }, [activeSection, ticker, sectionScrollRequest, focusRowKey]);

  useEffect(() => {
    setFullStatements(null);
    setStatementsError("");
    setLoadingStatements(false);
  }, [ticker, resolvedFiscalYear, period, isPro]);

  useEffect(() => {
    if (!showFullGaapStatements || fullStatements) {
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
          if (err instanceof ApiError && err.isPaywall) {
            const detail = err.detail;
            const reason =
              typeof detail === "object" && detail !== null && "reason" in detail
                ? String(detail.reason)
                : "subscription_required";
            onPaywall?.(
              reason,
              formatApiError(
                err,
                "Full GAAP financial statements require a Professional subscription."
              )
            );
            setStatementsError("");
            return;
          }
          setStatementsError(err instanceof Error ? err.message : "Failed to load statements");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingStatements(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeSection,
    showFullGaapStatements,
    fullStatements,
    ticker,
    resolvedFiscalYear,
    period,
    onPaywall,
  ]);

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
      scrollFilingColumnToTop(scrollRef.current);
      return;
    }

    if (!sectionHtmlRequest) return;

    const requestedSectionId = sectionHtmlRequest.sectionId;
    const cached = readCachedSectionHtml(sectionHtmlRequest);
    if (cached) {
      setSectionHtml(sanitizeExcerptHtml(cached));
      setShowHtmlExcerpt(true);
      scrollFilingColumnToTop(scrollRef.current);
      return;
    }

    setLoadingHtml(true);
    setSectionError("");

    fetchSectionHtmlDeduped(sectionHtmlRequest)
      .then((html) => {
        if (requestedSectionId !== activeSectionRef.current) return;
        if (!html?.trim()) {
          setSectionError("No excerpt available for this section in the selected filing.");
          setShowHtmlExcerpt(false);
          return;
        }
        setSectionHtml(html);
        setShowHtmlExcerpt(true);
        scrollFilingColumnToTop(scrollRef.current);
      })
      .catch((err) => {
        if (requestedSectionId !== activeSectionRef.current) return;
        if (err instanceof ApiError && err.isPaywall) {
          const detail = err.detail;
          const reason =
            typeof detail === "object" && detail !== null && "reason" in detail
              ? String(detail.reason)
              : "subscription_required";
          const message = formatApiError(
            err,
            "Historical filings and full SEC filing excerpts require a Professional subscription."
          );
          onPaywall?.(reason, message);
          setSectionError("");
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setSectionError("This section is not available in the selected filing.");
          setShowHtmlExcerpt(false);
          return;
        }
        if (err instanceof ApiError && err.status >= 500) {
          setSectionError(
            formatApiError(err, "Could not load the SEC filing excerpt. Please try again in a moment.")
          );
          setShowHtmlExcerpt(false);
          return;
        }
        setSectionError(
          formatApiError(err, "Could not load the SEC filing excerpt. Please try again.")
        );
        setShowHtmlExcerpt(false);
      })
      .finally(() => setLoadingHtml(false));
  }, [
    activeSection,
    loadingHtml,
    sectionHtml,
    sectionHtmlRequest,
    onPaywall,
  ]);

  const showFinancialsBootstrap =
    activeSection === "financial-statements" && (hasXbrlData || financialsPending);

  const showStatementBootstrap =
    showFullGaapStatements && (loadingStatements || fullStatements != null || financialsPending);

  if (error) {
    return (
      <div className="compare-column flex h-full min-h-0 flex-col border-r border-slate-200 bg-white">
        <ColumnHeader ticker={ticker} companyName={companyName} form={null} filingDate={null} fiscalYear={null} />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
          <p className="text-center text-sm font-medium text-red-700">Could not load filing</p>
          <p className="text-center text-sm text-red-600">{formatColumnError(error)}</p>
        </div>
      </div>
    );
  }

  const columnStyle = columnLayout?.fixedColumns
    ? { minWidth: columnLayout.minWidth, maxWidth: columnLayout.minWidth }
    : undefined;

  return (
    <div
      data-compare-ticker={ticker.toUpperCase()}
      className={`compare-column flex h-full min-h-0 flex-col border-r border-slate-200 bg-slate-50/50 last:border-r-0${
        isCompact ? " compare-column--compact" : ""
      }${tableFit ? " compare-column--table-fit" : ""}`}
      style={columnStyle}
      onWheel={forwardVerticalWheelToFilingColumnScroll}
    >
      <ColumnHeader
        ticker={ticker}
        companyName={companyName}
        form={formLabel}
        filingDate={filingDate}
        fiscalYear={fiscalYear}
        compact={isCompact}
        deltaFlagCount={deltaFlagCount}
        foreignFilerTooltip={foreignFilerTooltip}
      />

      <div
        className={`section-title-bar shrink-0 border-b border-slate-200 bg-white ${
          isCompact ? "px-3.5 py-2" : "px-5 py-3"
        }`}
      >
        <p className="font-sans text-[11px] font-semibold uppercase tracking-wider text-brand-700">
          {displayLabel}
        </p>
      </div>

      <div
        key={columnContentKey}
        ref={scrollRef}
        data-filing-column-scroll=""
        className="filing-column-scroll min-h-0 flex-1 overflow-y-scroll overscroll-y-contain"
      >
        <div
          ref={bodyTopRef}
          className={`compare-column-body ${isCompact ? "px-3.5 py-3.5" : "px-5 py-5"}`}
        >
          {xbrlPanel}

          {activeSection === "financial-statements" && hasXbrlData && !isPro && (
            <LockedStatementsPanel onUpgrade={handleStatementsUpgrade} />
          )}

          {showFullGaapStatements && (
            <>
              {loadingStatements && !fullStatements && (
                <div className="mb-4 space-y-2 rounded-lg border border-brand-200 bg-brand-50/40 px-4 py-4 shadow-sm">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-brand-200" />
                  <div className="h-4 w-full animate-pulse rounded bg-brand-100" />
                  <p className="text-[10px] text-brand-700/70">
                    {activeSection === "financial-statements"
                      ? "Loading full GAAP financial statements…"
                      : "Loading full GAAP statement…"}
                  </p>
                </div>
              )}
              {statementsError && !fullStatements && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-xs text-red-700">{statementsError}</p>
                </div>
              )}
              {fullStatements &&
                (activeSection === "financial-statements" ? (
                  ALL_STATEMENT_TABS.map((tab) => {
                    const table = fullStatements.statements[tab];
                    if (!table?.rows.length) return null;
                    return (
                      <SingleStatementPanel
                        key={tab}
                        table={table}
                        period={fullStatements.period}
                        title={`Full GAAP — ${table.label}`}
                        fetchMs={fullStatements.fetch_ms}
                        fromCache={fullStatements.from_cache}
                        tableFit={tableFit}
                      />
                    );
                  })
                ) : activeStatementTable ? (
                  <>
                    <SingleStatementPanel
                      table={activeStatementTable}
                      period={fullStatements.period}
                      title={`Full GAAP — ${displayLabel}`}
                      fetchMs={fullStatements.fetch_ms}
                      fromCache={fullStatements.from_cache}
                      tableFit={tableFit}
                    />
                    {activeStatementTable.rows.length === 0 && gaapStatementFilingUrl && (
                      <FilingViewer
                        filingUrl={gaapStatementFilingUrl}
                        sectionLabel={displayLabel}
                        ticker={ticker}
                      />
                    )}
                  </>
                ) : null)}
            </>
          )}

          {financialsError &&
          (activeSection === "financial-statements" || isStatementSection) &&
          !xbrlPanel &&
          !(showFullGaapStatements && fullStatements) ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4">
              <p className="text-sm font-medium text-red-800">Could not load XBRL financials</p>
              <p className="mt-1 text-xs text-red-700">{financialsError}</p>
            </div>
          ) : financialsPending &&
            (activeSection === "financial-statements" || isStatementSection) &&
            !xbrlPanel &&
            !showStatementBootstrap ? (
            <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 px-5 py-5 shadow-sm">
              <div className="h-4 w-3/4 animate-pulse rounded bg-brand-200" />
              <div className="h-4 w-full animate-pulse rounded bg-brand-100" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-brand-100" />
              <p className="text-[10px] text-brand-700/70">Loading SEC XBRL financials…</p>
            </div>
          ) : !activeSection && sections.length === 0 && !showFinancialsBootstrap ? (
            <p className="text-sm text-slate-400">Select a section from the left panel.</p>
          ) : sectionsPending &&
            activeSection &&
            activeSection !== "financial-statements" &&
            !isStatementSection ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-sm">
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
              <p className="text-[10px] text-slate-500">Loading filing section…</p>
            </div>
          ) : activeSection &&
            !hasSectionInFiling &&
            !xbrlPanel &&
            !showFinancialsBootstrap &&
            !showStatementBootstrap ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-500">
                {filingColumnNotFiledHeading(displayLabel)}
              </p>
              <p className="mt-1 text-xs text-slate-400">{filingColumnNotFiledBody(ticker)}</p>
            </div>
          ) : notesPending &&
            activeSection?.startsWith("note-") &&
            !xbrlPanel ? (
            <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 px-5 py-5 shadow-sm">
              <div className="h-4 w-3/4 animate-pulse rounded bg-brand-200" />
              <div className="h-4 w-full animate-pulse rounded bg-brand-100" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-brand-100" />
              <p className="text-[10px] text-brand-700/70">Loading XBRL footnote data…</p>
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
              {showExcerptToggle && !showHtmlExcerpt && (
                <>
                  <ExcerptToggleButton
                    label="View SEC filing excerpt"
                    loading={loadingHtml}
                    onClick={loadHtmlExcerpt}
                    onWarm={warmSectionHtml}
                  />
                  {isNarrativeSection(activeSection) && sectionFilingUrl && (
                    <EdgarSectionLink filingUrl={sectionFilingUrl} />
                  )}
                </>
              )}

              {showHtmlExcerpt && sectionHtml && (
                <>
                  <p className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    SEC filing excerpt
                  </p>
                  <HtmlExcerpt html={sectionHtml} compact={isCompact} />
                  {isNarrativeSection(activeSection) && sectionFilingUrl && (
                    <EdgarSectionLink filingUrl={sectionFilingUrl} />
                  )}
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
  compact = false,
  deltaFlagCount = 0,
  foreignFilerTooltip = null,
}: {
  ticker: string;
  companyName: string;
  form: string | null;
  filingDate: string | null;
  fiscalYear: number | null;
  compact?: boolean;
  deltaFlagCount?: number;
  foreignFilerTooltip?: string | null;
}) {
  const heatTone =
    deltaFlagCount >= 5 ? "bg-amber-100 text-amber-900" : deltaFlagCount >= 2 ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-600";

  return (
    <header
      className={`column-header-bar shrink-0 border-b border-slate-200 bg-white ${
        compact ? "px-3.5 py-2.5" : "px-5 py-3"
      }${deltaFlagCount > 0 ? " ring-1 ring-inset ring-amber-200/60" : ""}`}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-lg font-bold text-slate-900">{ticker}</span>
        {form && (
          <span
            className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600"
            title={foreignFilerTooltip ?? undefined}
          >
            {form}
          </span>
        )}
        {deltaFlagCount > 0 && (
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${heatTone}`}
            title={`${deltaFlagCount} delta${deltaFlagCount === 1 ? "" : "s"} vs peers`}
          >
            {deltaFlagCount} Δ
          </span>
        )}
      </div>
      <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-500">{companyName}</p>
      {(filingDate || fiscalYear) && (
        <p className="mt-1 font-mono text-xs tabular-nums leading-snug text-slate-400">
          {fiscalYear && `FY ${fiscalYear}`}
          {filingDate && ` · Filed ${filingDate}`}
        </p>
      )}
    </header>
  );
}

export default memo(FilingColumn);
