export const FILING_COLUMN_SCROLL_ATTR = "data-filing-column-scroll";
export const FILING_COLUMN_SCROLL_SELECTOR = `[${FILING_COLUMN_SCROLL_ATTR}]`;
export const METRIC_ROW_ATTR = "data-metric-row";
export const METRIC_ROW_SELECTOR = (rowKey: string) => `[${METRIC_ROW_ATTR}="${rowKey}"]`;

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

/** Vertically center a metric row within its filing column scroll container. */
export function scrollMetricRowIntoView(
  scrollEl: HTMLElement | null,
  rowKey: string,
  behavior: ScrollBehavior = "smooth"
): boolean {
  if (!scrollEl) return false;
  const row = scrollEl.querySelector<HTMLElement>(METRIC_ROW_SELECTOR(rowKey));
  if (!row) return false;

  const scrollRect = scrollEl.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const targetTop =
    rowRect.top - scrollRect.top + scrollEl.scrollTop - scrollRect.height / 2 + rowRect.height / 2;
  scrollEl.scrollTo({ top: Math.max(0, targetTop), behavior });
  return true;
}

/** Retry metric-row centering while XBRL table rows mount. */
export function scrollMetricRowIntoViewWhenReady(
  scrollEl: HTMLElement | null,
  rowKey: string,
  attemptsLeft = 24
): void {
  if (scrollMetricRowIntoView(scrollEl, rowKey, "auto")) return;
  if (attemptsLeft <= 0) return;
  requestAnimationFrame(() => scrollMetricRowIntoViewWhenReady(scrollEl, rowKey, attemptsLeft - 1));
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
