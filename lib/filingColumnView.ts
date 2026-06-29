import { DELTA_MAP_NOT_FILED_TOOLTIP, formatSectionRowLabel } from "./delta-labels";
import { isNarrativeSection, isXbrlBackedSection } from "./sections";

export function isFootnoteSection(sectionId: string | null): boolean {
  return sectionId?.startsWith("note-") ?? false;
}

/** Column empty state when a catalog section is absent from the parse index. */
export function filingColumnNotFiledHeading(sectionLabel: string): string {
  const short = formatSectionRowLabel(sectionLabel);
  return `${short} not in this filing`;
}

export function filingColumnNotFiledBody(ticker: string): string {
  return `${ticker} — ${DELTA_MAP_NOT_FILED_TOOLTIP.toLowerCase()}`;
}

/** Resolve compare column content mode for a filing section. */
export function resolveFilingColumnContentMode(params: {
  activeSection: string | null;
  hasSectionInFiling: boolean;
  hasXbrlData: boolean;
  isStatementSection: boolean;
}): {
  showSecViewer: boolean;
  showExcerptToggle: boolean;
  xbrlOnly: boolean;
} {
  const { activeSection, hasSectionInFiling, hasXbrlData, isStatementSection } = params;
  const footnote = isFootnoteSection(activeSection);

  const xbrlOnly = Boolean(
    activeSection && isXbrlBackedSection(activeSection) && hasXbrlData
  );

  // XBRL-backed sections without tagged data fall back to EDGAR (not narratives/footnotes).
  const showSecViewer = Boolean(
    activeSection &&
      hasSectionInFiling &&
      !isStatementSection &&
      !footnote &&
      !isNarrativeSection(activeSection) &&
      isXbrlBackedSection(activeSection) &&
      !hasXbrlData
  );

  const showExcerptToggle = Boolean(
    activeSection &&
      hasSectionInFiling &&
      !isStatementSection &&
      !showSecViewer &&
      (xbrlOnly ||
        (footnote && isXbrlBackedSection(activeSection) && !hasXbrlData) ||
        isNarrativeSection(activeSection))
  );

  return { showSecViewer, showExcerptToggle, xbrlOnly };
}
