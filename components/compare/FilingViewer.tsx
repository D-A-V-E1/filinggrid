"use client";

import { useCallback } from "react";

interface FilingViewerProps {
  filingUrl: string;
  sectionLabel: string;
  ticker: string;
}

export default function FilingViewer({ filingUrl, sectionLabel, ticker }: FilingViewerProps) {
  const openInNewTab = useCallback(() => {
    window.open(filingUrl, "_blank", "noopener,noreferrer");
  }, [filingUrl]);

  return (
    <article className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="font-sans text-[11px] font-semibold uppercase tracking-wider text-brand-700">
        {sectionLabel}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        The full disclosure for{" "}
        <span className="font-mono font-semibold text-slate-800">{ticker}</span> is in the official SEC
        filing. Open the section directly on EDGAR.
      </p>
      <button
        type="button"
        onClick={openInNewTab}
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 font-sans text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
      >
        View on SEC EDGAR
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </button>
    </article>
  );
}
