export const FILING_COLUMN_SCROLL_ATTR = "data-filing-column-scroll";
export const FILING_COLUMN_SCROLL_SELECTOR = `[${FILING_COLUMN_SCROLL_ATTR}]`;

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
