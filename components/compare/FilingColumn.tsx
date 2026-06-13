"use client";

import { useEffect, useRef, useState } from "react";
import { SECTION_EVENT, type SectionSelectDetail } from "@/lib/utils";
import type { FilingSection } from "@/lib/api";

interface FilingColumnProps {
  ticker: string;
  companyName: string;
  form: string | null;
  filingDate: string | null;
  fiscalYear: number | null;
  sections: FilingSection[];
  error: string | null;
}

export default function FilingColumn({
  ticker,
  companyName,
  form,
  filingDate,
  fiscalYear,
  sections,
  error,
}: FilingColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  useEffect(() => {
    function handleSectionSelect(e: Event) {
      const { sectionId } = (e as CustomEvent<SectionSelectDetail>).detail;
      const el = scrollRef.current?.querySelector(`[data-section-id="${sectionId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveSection(sectionId);
      }
    }
    window.addEventListener(SECTION_EVENT, handleSectionSelect);
    return () => window.removeEventListener(SECTION_EVENT, handleSectionSelect);
  }, []);

  if (error) {
    return (
      <div className="flex h-full flex-col border-r border-slate-200 bg-white">
        <ColumnHeader ticker={ticker} companyName={companyName} form={null} filingDate={null} fiscalYear={null} />
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-center text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col border-r border-slate-200 bg-white last:border-r-0">
      <ColumnHeader
        ticker={ticker}
        companyName={companyName}
        form={form}
        filingDate={filingDate}
        fiscalYear={fiscalYear}
      />
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain scroll-smooth">
        {sections.map((section) => (
          <article
            key={section.id}
            data-section-id={section.id}
            className={`border-b border-slate-100 px-5 py-6 transition-colors ${
              activeSection === section.id ? "bg-brand-50/40" : ""
            }`}
          >
            <h3 className="mb-4 font-sans text-xs font-semibold uppercase tracking-wider text-brand-700">
              {section.label}
            </h3>
            <div
              className="filing-content prose prose-sm max-w-none font-serif text-slate-800 prose-headings:font-sans prose-headings:text-slate-900 prose-table:text-xs prose-td:px-2 prose-th:px-2 prose-th:font-semibold"
              dangerouslySetInnerHTML={{ __html: section.html }}
            />
          </article>
        ))}
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
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
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
