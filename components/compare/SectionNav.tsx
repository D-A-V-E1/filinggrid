"use client";

import { broadcastSectionSelect } from "@/lib/utils";

interface SectionNavProps {
  sections: { id: string; label: string }[];
  activeSection: string | null;
}

export default function SectionNav({ sections, activeSection }: SectionNavProps) {
  const groups = [
    { title: "Business & Risk", ids: ["business", "risk-factors", "unresolved-staff", "properties", "legal-proceedings"] },
    { title: "Analysis", ids: ["mda", "market-risk"] },
    { title: "Financials", ids: ["financial-statements", "controls", "other-info"] },
    {
      title: "Footnotes",
      ids: [
        "note-revenue", "note-segments", "note-debt", "note-leases",
        "note-income-tax", "note-stock-comp", "note-software", "note-contingencies",
      ],
    },
  ];

  const sectionMap = new Map(sections.map((s) => [s.id, s]));

  return (
    <nav
      className="flex h-full w-60 shrink-0 flex-col border-r border-slate-200 bg-slate-50"
      aria-label="SEC disclosure sections"
    >
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Sections
        </p>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {groups.map((group) => {
          const groupSections = group.ids
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
                      type="button"
                      onClick={() => broadcastSectionSelect(section.id)}
                      className={`w-full px-4 py-1.5 text-left text-xs leading-snug transition ${
                        activeSection === section.id
                          ? "border-l-2 border-brand-600 bg-white font-medium text-brand-700"
                          : "border-l-2 border-transparent text-slate-600 hover:bg-white hover:text-slate-900"
                      }`}
                    >
                      {section.label.replace(/^Item \d+[A-Z]? — /, "")}
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
