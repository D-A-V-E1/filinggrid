"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface FilingViewerProps {
  filingUrl: string;
  sectionLabel: string;
  ticker: string;
}

export default function FilingViewer({ filingUrl, sectionLabel, ticker }: FilingViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  useEffect(() => {
    setIframeBlocked(false);
    setIframeLoaded(false);
  }, [filingUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const iframe = iframeRef.current;
      if (!iframe || iframeBlocked) return;
      try {
        const doc = iframe.contentDocument;
        if (doc && doc.body && doc.body.childElementCount === 0) {
          setIframeBlocked(true);
        }
      } catch {
        // Cross-origin — cannot inspect; assume iframe may still be usable.
      }
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [filingUrl, iframeBlocked, iframeLoaded]);

  const openInNewTab = useCallback(() => {
    window.open(filingUrl, "_blank", "noopener,noreferrer");
  }, [filingUrl]);

  return (
    <div className="flex flex-col gap-4">
      <article className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <p className="text-sm leading-relaxed text-slate-600">
          The full <span className="font-medium text-slate-800">{sectionLabel}</span> disclosure for{" "}
          <span className="font-mono font-semibold text-slate-800">{ticker}</span> is in the official SEC
          filing. Use the link below to read it on EDGAR.
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

      {!iframeBlocked ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
            <p className="font-sans text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              SEC filing preview
            </p>
          </div>
          <iframe
            ref={iframeRef}
            title={`${ticker} SEC filing`}
            src={filingUrl}
            className="h-[min(70vh,720px)] w-full bg-white"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerPolicy="no-referrer"
            onLoad={() => setIframeLoaded(true)}
            onError={() => setIframeBlocked(true)}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
          <p className="text-sm font-medium text-slate-700">SEC blocks embedded filing previews</p>
          <p className="mt-1 text-xs text-slate-500">
            EDGAR does not allow this filing to load in an embedded pane. Open it directly on sec.gov.
          </p>
          <button
            type="button"
            onClick={openInNewTab}
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-brand-300 bg-white px-4 py-2 font-sans text-sm font-medium text-brand-700 shadow-sm transition hover:bg-brand-50"
          >
            Open filing in new tab
          </button>
        </div>
      )}
    </div>
  );
}
