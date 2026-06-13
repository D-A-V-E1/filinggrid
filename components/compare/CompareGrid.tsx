"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, getAuthMe, parseFilings, type FilingColumn, type ParseResponse } from "@/lib/api";
import FilingColumnComponent from "./FilingColumn";
import SectionNav from "./SectionNav";
import PaywallModal from "../billing/PaywallModal";
import TickerSearchBar from "../TickerSearchBar";

interface CompareGridProps {
  tickers: string[];
  fiscalYear?: number;
}

export default function CompareGrid({ tickers, fiscalYear }: CompareGridProps) {
  const [data, setData] = useState<ParseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [paywall, setPaywall] = useState<{ open: boolean; reason: string; message: string }>({
    open: false,
    reason: "",
    message: "",
  });
  const [tier, setTier] = useState("free");

  const loadFilings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [result, auth] = await Promise.all([
        parseFilings(tickers, fiscalYear),
        getAuthMe().catch(() => null),
      ]);
      setData(result);
      if (auth) setTier(auth.tier);
      if (result.section_catalog.length > 0) {
        setActiveSection(result.section_catalog[0].id);
      }
    } catch (err) {
      if (err instanceof ApiError && err.isPaywall) {
        const detail = err.detail as { reason?: string; message?: string };
        setPaywall({
          open: true,
          reason: detail.reason || "subscription_required",
          message: detail.message || "Upgrade to Professional to continue.",
        });
      } else {
        setError(err instanceof Error ? err.message : "Failed to load filings");
      }
    } finally {
      setLoading(false);
    }
  }, [tickers, fiscalYear]);

  useEffect(() => {
    loadFilings();
  }, [loadFilings]);

  useEffect(() => {
    function handleSectionSelect(e: Event) {
      const detail = (e as CustomEvent).detail as { sectionId: string };
      setActiveSection(detail.sectionId);
    }
    window.addEventListener("filinggrid:section-select", handleSectionSelect);
    return () => window.removeEventListener("filinggrid:section-select", handleSectionSelect);
  }, []);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 py-2">
        <TickerSearchBar initialTickers={tickers} compact />
        <div className="ml-auto flex items-center gap-3">
          {tier === "professional" && (
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
              Professional
            </span>
          )}
          {loading && (
            <span className="text-xs text-slate-400">Loading filings…</span>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex min-h-0 flex-1">
        {loading && !data && (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex gap-8">
              {tickers.map((t) => (
                <div key={t} className="w-72 animate-pulse space-y-3">
                  <div className="h-12 rounded bg-slate-200" />
                  <div className="h-64 rounded bg-slate-100" />
                  <div className="h-48 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && !data && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {data && (
          <>
            <SectionNav
              sections={data.section_catalog}
              activeSection={activeSection}
            />
            <div
              className="grid min-h-0 flex-1"
              style={{
                gridTemplateColumns: `repeat(${data.columns.length}, minmax(320px, 1fr))`,
              }}
            >
              {data.columns.map((col: FilingColumn) => (
                <FilingColumnComponent
                  key={col.ticker}
                  ticker={col.ticker}
                  companyName={col.company_name}
                  form={col.form}
                  filingDate={col.filing_date}
                  fiscalYear={col.fiscal_year}
                  sections={col.sections}
                  error={col.error}
                />
              ))}
            </div>
          </>
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
