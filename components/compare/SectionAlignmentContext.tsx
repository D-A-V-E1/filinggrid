"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";

interface SectionAlignmentContextValue {
  minHeights: Record<string, number>;
  registerSection: (sectionId: string, el: HTMLElement | null) => void;
}

const SectionAlignmentContext = createContext<SectionAlignmentContextValue | null>(null);

/** Row-height sync disabled — measuring full filing HTML was blocking navigation. */
export function SectionAlignmentProvider({ children }: { sectionIds?: string[]; children: ReactNode }) {
  const registerSection = useCallback((_sectionId: string, _el: HTMLElement | null) => {}, []);

  return (
    <SectionAlignmentContext.Provider value={{ minHeights: {}, registerSection }}>
      <div className="flex h-full min-h-0 w-full overflow-hidden">{children}</div>
    </SectionAlignmentContext.Provider>
  );
}

export function useSectionAlignment() {
  const ctx = useContext(SectionAlignmentContext);
  if (!ctx) {
    throw new Error("useSectionAlignment must be used within SectionAlignmentProvider");
  }
  return ctx;
}
