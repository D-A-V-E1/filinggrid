"use client";

import { useEffect, useRef } from "react";
import { getNavGroups } from "@/lib/sections";
import type { DeltaFlag } from "@/lib/delta-types";
import DeltaStrip from "./DeltaStrip";

interface SectionNavProps {
  availableSectionIds: Set<string>;
  sectionCatalog: { id: string; label: string }[];
  activeSection: string | null;
  onSectionSelect: (sectionId: string) => void;
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
  const navScrollRef = useRef<HTMLDivElement>(null);
  const activeButtonRef = useRef<HTMLButtonElement>(null);
  const sectionMap = new Map(sectionCatalog.map((s) => [s.id, s]));
  const navGroups = getNavGroups(isPro);

  const showKeyDeltas =
    Boolean(onDeltaFlagClick) &&
    (deltasLoading || stripFlags.length > 0 || stripTotalCount > 0 || totalFlagCount > 0);

  useEffect(() => {
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
  }, [activeSection]);

  function handleSelect(sectionId: string) {
    onSectionSelect(sectionId);
    onMobileClose?.();
  }

  function handleDeltaFlagClick(flag: DeltaFlag) {
    onDeltaFlagClick?.(flag);
    onMobileClose?.();
  }

  const navContent = (
    <nav
      className="flex h-full w-60 max-w-[85vw] shrink-0 flex-col border-r border-slate-200 bg-slate-50"
      aria-label="SEC disclosure sections"
    >
      <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Sections</p>
            {availableSectionIds.size === 0 && (
              <p className="mt-1 text-[10px] text-slate-400">Waiting for filings…</p>
            )}
          </div>
          {onMobileClose && (
            <button
              type="button"
              onClick={onMobileClose}
              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 md:hidden"
              aria-label="Close section menu"
            >
              ×
            </button>
          )}
        </div>
      </div>
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
      {showKeyDeltas && (
        <div className="flex max-h-[min(45vh,320px)] min-h-0 shrink-0 flex-col border-t border-slate-200 bg-white">
          <DeltaStrip
            layout="nav"
            flags={stripFlags}
            loading={deltasLoading}
            stripTotalCount={stripTotalCount}
            totalFlagCount={totalFlagCount}
            tagline={tagline}
            onFlagClick={handleDeltaFlagClick}
            onViewMoreInMap={onViewMoreInMap}
          />
        </div>
      )}
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
