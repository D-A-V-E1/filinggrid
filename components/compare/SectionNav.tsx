"use client";

import { useEffect, useRef } from "react";
import { NAV_GROUPS } from "@/lib/sections";

interface SectionNavProps {
  /** Section IDs that exist in at least one loaded filing. */
  availableSectionIds: Set<string>;
  sectionCatalog: { id: string; label: string }[];
  activeSection: string | null;
  onSectionSelect: (sectionId: string) => void;
}

export default function SectionNav({
  availableSectionIds,
  sectionCatalog,
  activeSection,
  onSectionSelect,
}: SectionNavProps) {
  const navScrollRef = useRef<HTMLDivElement>(null);
  const activeButtonRef = useRef<HTMLButtonElement>(null);
  const sectionMap = new Map(sectionCatalog.map((s) => [s.id, s]));

  useEffect(() => {
    if (activeButtonRef.current && navScrollRef.current) {
      activeButtonRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeSection]);

  return (
    <nav
      className="z-20 flex h-full w-60 shrink-0 flex-col border-r border-slate-200 bg-slate-50"
      aria-label="SEC disclosure sections"
    >
      <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Sections
        </p>
        {availableSectionIds.size === 0 && (
          <p className="mt-1 text-[10px] text-slate-400">Waiting for filings…</p>
        )}
      </div>
      <div ref={navScrollRef} className="min-h-0 flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map((group) => {
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
                      onClick={() => onSectionSelect(section.id)}
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
    </nav>
  );
}
