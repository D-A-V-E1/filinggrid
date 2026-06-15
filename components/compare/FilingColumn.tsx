"use client";

import { memo, useEffect, useRef } from "react";
import type { FilingSection } from "@/lib/api";

interface FilingColumnProps {
  ticker: string;
  companyName: string;
  form: string | null;
  filingDate: string | null;
  fiscalYear: number | null;
  sections: FilingSection[];
  activeSection: string | null;
  sectionLabel: string | null;
  error: string | null;
}

function formatSectionLabel(label: string): string {
  return label.replace(/^Item \d+[A-Z]? — /, "").replace(/^Note — /, "");
}

function FilingColumn({
  ticker,
  companyName,
  form,
  filingDate,
  fiscalYear,
  sections,
  activeSection,
  sectionLabel,
  error,
}: FilingColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const section = activeSection ? sections.find((s) => s.id === activeSection) : sections[0];
  const displayLabel = section
    ? formatSectionLabel(section.label)
    : sectionLabel
      ? formatSectionLabel(sectionLabel)
      : "Select a section";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeSection, ticker]);

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
          {!activeSection && sections.length === 0 ? (
            <p className="text-sm text-slate-400">Select a section from the left panel.</p>
          ) : !section ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-500">Not in this filing</p>
              <p className="mt-1 text-xs text-slate-400">
                {ticker} did not include this disclosure in the selected period.
              </p>
            </div>
          ) : section.html && section.html.length > 0 ? (
            <article className="rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-sm">
              <div
                className="filing-content prose prose-sm max-w-none font-serif text-slate-800 prose-headings:font-sans prose-headings:text-slate-900 prose-table:text-xs prose-td:px-2 prose-th:px-2 prose-th:font-semibold"
                dangerouslySetInnerHTML={{ __html: section.html }}
              />
            </article>
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
