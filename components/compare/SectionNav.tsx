"use client";

import { useEffect, useRef, useState } from "react";
import { getNavGroups } from "@/lib/sections";
import type { DeltaFlag } from "@/lib/delta-types";
import DeltaStrip from "./DeltaStrip";

type LeftPaneView = "sections" | "deltas";

interface SectionNavProps {
  availableSectionIds: Set<string>;
  sectionCatalog: { id: string; label: string }[];
  activeSection: string | null;
  onSectionSelect: (sectionId: string, focusTicker?: string, rowKey?: string) => void;
  isPro?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  stripFlags?: DeltaFlag[];
  deltasLoading?: boolean;
  stripTotalCount?: number;
  totalFlagCount?: number;
  tagline?: string;
  onDeltaFlagClick?: (flag: DeltaFlag) => void;
  onViewMoreInMap?: () => void;
}

export default function SectionNav({
  availableSectionIds,
  sectionCatalog,
  activeSection,
  onSectionSelect,
  isPro = false,
  mobileOpen = false,
  onMobileClose,
  stripFlags = [],
  deltasLoading = false,
  stripTotalCount = 0,
  totalFlagCount = 0,
  tagline,
  onDeltaFlagClick,
  onViewMoreInMap,
}: SectionNavProps) {
  const [leftPaneView, setLeftPaneView] = useState<LeftPaneView>("sections");
  const navScrollRef = useRef<HTMLDivElement>(null);
  const activeButtonRef = useRef<HTMLButtonElement>(null);
  const sectionMap = new Map(sectionCatalog.map((s) => [s.id, s]));
  const navGroups = getNavGroups(isPro);

  // Always show Sections | Deltas tabs once compare is wired (onDeltaFlagClick); empty state lives in DeltaStrip.
  const showKeyDeltas = Boolean(onDeltaFlagClick);

  useEffect(() => {
    if (leftPaneView !== "sections") return;

    const navEl = navScrollRef.current;
    const btnEl = activeButtonRef.current;
    if (!navEl || !btnEl) return;

    const navRect = navEl.getBoundingClientRect();
    const btnRect = btnEl.getBoundingClientRect();
    if (btnRect.top < navRect.top) {
      navEl.scrollTop -= navRect.top - btnRect.top;
    } else if (btnRect.bottom > navRect.bottom) {
      navEl.scrollTop += btnRect.bottom - navRect.bottom;
    }
  }, [activeSection, leftPaneView]);

  function handleSelect(sectionId: string) {
    onSectionSelect(sectionId, undefined, undefined);
    onMobileClose?.();
  }

  function handleDeltaFlagClick(flag: DeltaFlag) {
    onDeltaFlagClick?.(flag);
    onMobileClose?.();
  }

  const tabBar = showKeyDeltas ? (
    <div
      role="tablist"
      aria-label="Left pane view"
      className="flex shrink-0 border-b border-slate-200 bg-slate-50"
    >
      <button
        type="button"
        role="tab"
        id="left-pane-tab-sections"
        aria-selected={leftPaneView === "sections"}
        aria-controls="left-pane-panel-sections"
        onClick={() => setLeftPaneView("sections")}
        className={`flex-1 px-3 py-2.5 text-xs font-semibold uppercase tracking-widest transition ${
          leftPaneView === "sections"
            ? "border-b-2 border-brand-600 bg-white text-brand-700"
            : "border-b-2 border-transparent text-slate-500 hover:bg-white/60 hover:text-slate-700"
        }`}
      >
        Sections
      </button>
      <button
        type="button"
        role="tab"
        id="left-pane-tab-deltas"
        aria-selected={leftPaneView === "deltas"}
        aria-controls="left-pane-panel-deltas"
        onClick={() => setLeftPaneView("deltas")}
        className={`flex-1 px-3 py-2.5 text-xs font-semibold uppercase tracking-widest transition ${
          leftPaneView === "deltas"
            ? "border-b-2 border-brand-600 bg-white text-brand-700"
            : "border-b-2 border-transparent text-slate-500 hover:bg-white/60 hover:text-slate-700"
        }`}
      >
        Deltas
      </button>
    </div>
  ) : (
    <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Sections</p>
      {availableSectionIds.size === 0 && (
        <p className="mt-1 text-[10px] text-slate-400">Waiting for filings…</p>
      )}
    </div>
  );

  const sectionsPanel = (
    <div
      id="left-pane-panel-sections"
      role="tabpanel"
      aria-labelledby={showKeyDeltas ? "left-pane-tab-sections" : undefined}
      className={`left-pane-panel col-start-1 row-start-1 flex min-h-0 flex-col ${
        !showKeyDeltas || leftPaneView === "sections" ? "left-pane-panel--active" : ""
      }`}
      aria-hidden={showKeyDeltas && leftPaneView !== "sections"}
    >
      {showKeyDeltas && availableSectionIds.size === 0 && (
        <div className="shrink-0 border-b border-slate-100 px-4 py-2">
          <p className="text-[10px] text-slate-400">Waiting for filings…</p>
        </div>
      )}
      <div ref={navScrollRef} className="min-h-0 flex-1 overflow-y-auto py-2">
        {navGroups.map((group) => {
          const groupSections = group.ids
            .filter((id) => availableSectionIds.has(id))
            .map((id) => sectionMap.get(id))
            .filter(Boolean) as { id: string; label: string }[];

          if (groupSections.length === 0) return null;

          return (
            <div key={group.title} className="mb-3">
              <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {group.title}
              </p>
              <ul>
                {groupSections.map((section) => (
                  <li key={section.id}>
                    <button
                      ref={activeSection === section.id ? activeButtonRef : undefined}
                      type="button"
                      onClick={() => handleSelect(section.id)}
                      className={`w-full px-4 py-1.5 text-left text-xs leading-snug transition ${
                        activeSection === section.id
                          ? "border-l-2 border-brand-600 bg-white font-medium text-brand-700"
                          : "border-l-2 border-transparent text-slate-600 hover:bg-white hover:text-slate-900"
                      }`}
                    >
                      {section.label.replace(/^Item \d+[A-Z]? — /, "").replace(/^Note — /, "")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );

  const deltasPanel = showKeyDeltas ? (
    <div
      id="left-pane-panel-deltas"
      role="tabpanel"
      aria-labelledby="left-pane-tab-deltas"
      className={`left-pane-panel col-start-1 row-start-1 flex min-h-0 flex-col bg-white ${
        leftPaneView === "deltas" ? "left-pane-panel--active" : ""
      }`}
      aria-hidden={leftPaneView !== "deltas"}
    >
      {tagline && !deltasLoading && (
        <p className="shrink-0 border-b border-slate-100 px-3 py-2 text-[10px] leading-snug text-slate-500">
          {tagline}
        </p>
      )}
      <DeltaStrip
        layout="nav"
        hideHeader
        flags={stripFlags}
        loading={deltasLoading}
        stripTotalCount={stripTotalCount}
        totalFlagCount={totalFlagCount}
        onFlagClick={handleDeltaFlagClick}
        onViewMoreInMap={onViewMoreInMap}
      />
    </div>
  ) : null;

  const navContent = (
    <nav
      className="flex h-full w-60 max-w-[85vw] shrink-0 flex-col border-r border-slate-200 bg-slate-50"
      aria-label="SEC disclosure sections"
    >
      {onMobileClose && (
        <div className="flex shrink-0 justify-end border-b border-slate-200 bg-slate-50 px-3 py-2 md:hidden">
          <button
            type="button"
            onClick={onMobileClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            aria-label="Close section menu"
          >
            ×
          </button>
        </div>
      )}
      {tabBar}
      <div className="grid h-0 min-h-0 flex-1 grid-cols-1 grid-rows-1 overflow-hidden">
        {sectionsPanel}
        {deltasPanel}
      </div>
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden h-full shrink-0 md:flex">{navContent}</div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={onMobileClose} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 flex shadow-xl">{navContent}</div>
        </div>
      )}
    </>
  );
}
