export const FILING_COLUMN_SCROLL_ATTR = "data-filing-column-scroll";
export const FILING_COLUMN_SCROLL_SELECTOR = `[${FILING_COLUMN_SCROLL_ATTR}]`;
export const METRIC_ROW_ATTR = "data-metric-row";
export const METRIC_ROW_SELECTOR = (rowKey: string) => `[${METRIC_ROW_ATTR}="${rowKey}"]`;

let scrollGeneration = 0;

/** Invalidate in-flight metric-row scroll retries (e.g. after section nav reset). */
export function bumpScrollGeneration(): number {
  scrollGeneration += 1;
  return scrollGeneration;
}

export function getScrollGeneration(): number {
  return scrollGeneration;
}

function isScrollGenerationCurrent(generation: number): boolean {
  return generation === scrollGeneration;
}

/** Reset a single filing column scroll container to the top (sync + next frames). */
export function scrollFilingColumnToTop(scrollEl: HTMLElement | null): void {
  if (!scrollEl) return;
  const apply = () => {
    scrollEl.scrollTop = 0;
    scrollEl.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };
  apply();
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
}

/** Reset every compare filing column scroll container under `root`. */
export function resetAllFilingColumnScrolls(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(FILING_COLUMN_SCROLL_SELECTOR).forEach((el) => {
    scrollFilingColumnToTop(el);
  });
}

/** Reset filing column scroll containers except the column for `exceptTicker`. */
export function resetAllFilingColumnScrollsExcept(
  exceptTicker: string,
  root: ParentNode = document
): void {
  const upper = exceptTicker.toUpperCase();
  root.querySelectorAll<HTMLElement>(FILING_COLUMN_SCROLL_SELECTOR).forEach((el) => {
    const column = el.closest<HTMLElement>(`[data-compare-ticker="${upper}"]`);
    if (column) return;
    scrollFilingColumnToTop(el);
  });
}

/** Center a metric row in the browser viewport (window and outer scroll ancestors). */
export function scrollMetricRowIntoOuterView(
  row: HTMLElement,
  behavior: ScrollBehavior = "smooth"
): void {
  row.scrollIntoView({ block: "center", inline: "nearest", behavior });
}

/** Vertically center a metric row within its filing column and the page viewport. */
export function scrollMetricRowIntoView(
  scrollEl: HTMLElement | null,
  rowKey: string,
  behavior: ScrollBehavior = "smooth",
  generation = scrollGeneration
): boolean {
  if (!isScrollGenerationCurrent(generation)) return false;
  if (!scrollEl) return false;
  const row = scrollEl.querySelector<HTMLElement>(METRIC_ROW_SELECTOR(rowKey));
  if (!row) return false;

  const scrollRect = scrollEl.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const maxInnerScroll = scrollEl.scrollHeight - scrollEl.clientHeight;

  if (maxInnerScroll > 1) {
    const targetTop =
      rowRect.top - scrollRect.top + scrollEl.scrollTop - scrollRect.height / 2 + rowRect.height / 2;
    scrollEl.scrollTo({
      top: Math.max(0, Math.min(targetTop, maxInnerScroll)),
      behavior,
    });
    requestAnimationFrame(() => {
      if (!isScrollGenerationCurrent(generation)) return;
      scrollMetricRowIntoOuterView(row, behavior);
    });
  } else {
    scrollMetricRowIntoOuterView(row, behavior);
  }

  return true;
}

/** Retry metric-row centering while XBRL table rows mount. */
export function scrollMetricRowIntoViewWhenReady(
  scrollEl: HTMLElement | null,
  rowKey: string,
  attemptsLeft = 24,
  generation = scrollGeneration
): void {
  if (!isScrollGenerationCurrent(generation)) return;
  if (scrollMetricRowIntoView(scrollEl, rowKey, "auto", generation)) return;
  if (attemptsLeft <= 0) return;
  requestAnimationFrame(() =>
    scrollMetricRowIntoViewWhenReady(scrollEl, rowKey, attemptsLeft - 1, generation)
  );
}

/** Reset window/document scroll (compare page can leak vertical scroll to the body). */
export function resetWindowScroll(): void {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

/** Reset window scroll and all filing column scroll containers. */
export function resetCompareViewScroll(root: ParentNode = document): void {
  resetWindowScroll();
  resetAllFilingColumnScrolls(root);
}

/** Retry scroll reset across animation frames while layout settles. */
export function resetCompareViewScrollWhenReady(
  root: ParentNode = document,
  attemptsLeft = 12
): void {
  resetCompareViewScroll(root);
  if (attemptsLeft <= 0) return;
  requestAnimationFrame(() => resetCompareViewScrollWhenReady(root, attemptsLeft - 1));
}
