"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchSectionHtml,
  type FinancialsXbrl,
  type FilingSection,
  type NoteSectionXbrl,
} from "@/lib/api";
import { loadSectionHtml, saveSectionHtml } from "@/lib/parse-cache";

interface FilingColumnProps {
  ticker: string;
  companyName: string;
  form: string | null;
  filingDate: string | null;
  fiscalYear: number | null;
  cacheKey: string | null;
  sections: FilingSection[];
  activeSection: string | null;
  sectionLabel: string | null;
  error: string | null;
  financialsXbrl?: FinancialsXbrl | null;
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
}

function XbrlMetricsPanel({ rows, annualSummary, fetchMs, fromCache, subtitle }: XbrlPanelProps) {
  const tableRows = annualSummary.slice(0, 4);
  if (tableRows.length === 0) return null;

  const visibleRows = rows.filter(({ key }) => tableRows.some((r) => r[key] != null));
  if (visibleRows.length === 0) return null;

  return (
    <article className="mb-4 rounded-lg border border-brand-200 bg-brand-50/40 px-4 py-4 shadow-sm">
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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[280px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-brand-200/80">
              <th className="py-1.5 pr-3 font-medium text-slate-600">Metric</th>
              {tableRows.map((r) => (
                <th key={r.fy} className="py-1.5 px-2 text-right font-mono font-semibold text-slate-700">
                  FY {r.fy}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ key, label, unit }) => (
              <tr key={key} className="border-b border-brand-100/80 last:border-0">
                <td className="py-1.5 pr-3 text-slate-600">{label}</td>
                {tableRows.map((r) => {
                  const val = r[key];
                  return (
                    <td key={r.fy} className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-800">
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

function isXbrlBackedSection(sectionId: string | null): boolean {
  return sectionId === "financial-statements" || (sectionId?.startsWith("note-") ?? false);
}

function FilingColumn({
  ticker,
  companyName,
  form,
  filingDate,
  fiscalYear,
  cacheKey,
  sections,
  activeSection,
  sectionLabel,
  error,
  financialsXbrl,
}: FilingColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sectionHtml, setSectionHtml] = useState<string | null>(null);
  const [loadingSection, setLoadingSection] = useState(false);
  const [sectionError, setSectionError] = useState("");

  const section = activeSection ? sections.find((s) => s.id === activeSection) : sections[0];
  const displayLabel = section
    ? formatSectionLabel(section.label)
    : sectionLabel
      ? formatSectionLabel(sectionLabel)
      : "Select a section";

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
          subtitle="Headline GAAP metrics from SEC companyfacts. Full statement tables still load from HTML when available."
        />
      );
    }

    const note = financialsXbrl.notes_xbrl?.[activeSection];
    if (!note?.has_data || !note.annual_summary?.length) return null;

    return (
      <XbrlMetricsPanel
        rows={buildNoteRowMetrics(note)}
        annualSummary={note.annual_summary}
        fetchMs={financialsXbrl.fetch_ms}
        fromCache={financialsXbrl.from_cache}
        subtitle="Tagged GAAP facts from SEC companyfacts. Full footnote narrative loads from HTML below when available."
      />
    );
  }, [financialsXbrl, activeSection]);

  const showHtmlFallback = Boolean(sectionHtml && sectionHtml.length > 0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeSection, ticker]);

  useEffect(() => {
    if (!activeSection || !section) {
      setSectionHtml(null);
      setLoadingSection(false);
      setSectionError("");
      return;
    }

    if (section.html && section.html.length > 0) {
      setSectionHtml(section.html);
      setLoadingSection(false);
      setSectionError("");
      return;
    }

    if (cacheKey) {
      const cached = loadSectionHtml(cacheKey, activeSection);
      if (cached) {
        setSectionHtml(cached);
        setLoadingSection(false);
        setSectionError("");
        return;
      }
    }

    let cancelled = false;
    setLoadingSection(true);
    setSectionError("");
    setSectionHtml(null);

    fetchSectionHtml(ticker, activeSection, fiscalYear)
      .then((html) => {
        if (cancelled) return;
        if (cacheKey) saveSectionHtml(cacheKey, activeSection, html);
        setSectionHtml(html);
      })
      .catch((err) => {
        if (cancelled) return;
        setSectionError(err instanceof Error ? err.message : "Failed to load section");
      })
      .finally(() => {
        if (!cancelled) setLoadingSection(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, section, ticker, fiscalYear, cacheKey]);

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
        form={form}
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
          {!activeSection && sections.length === 0 ? (
            <p className="text-sm text-slate-400">Select a section from the left panel.</p>
          ) : !section ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-500">Not in this filing</p>
              <p className="mt-1 text-xs text-slate-400">
                {ticker} did not include this disclosure in the selected period.
              </p>
            </div>
          ) : loadingSection && !xbrlPanel ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-sm">
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
            </div>
          ) : sectionError && !xbrlPanel ? (
            <div className="rounded-lg border border-red-200 bg-white px-4 py-6 text-center">
              <p className="text-sm text-red-600">{sectionError}</p>
            </div>
          ) : showHtmlFallback ? (
            <>
              {xbrlPanel && (
                <p className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Filing excerpt
                </p>
              )}
              <article className="rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-sm">
                <div
                  className="filing-content prose prose-sm max-w-none font-serif text-slate-800 prose-headings:font-sans prose-headings:text-slate-900 prose-table:text-xs prose-td:px-2 prose-th:px-2 prose-th:font-semibold"
                  dangerouslySetInnerHTML={{ __html: sectionHtml! }}
                />
              </article>
            </>
          ) : loadingSection ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-sm">
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
            </div>
          ) : sectionError ? (
            <div className="rounded-lg border border-red-200 bg-white px-4 py-6 text-center">
              <p className="text-sm text-red-600">{sectionError}</p>
            </div>
          ) : (
            <article className="rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-sm">
              <p className="text-sm leading-relaxed text-slate-600">
                {section.text_preview || "No content available."}
              </p>
            </article>
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
