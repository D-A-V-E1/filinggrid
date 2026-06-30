import type { WheelEvent as ReactWheelEvent } from "react";

export const FILING_COLUMN_SCROLL_CLASS = "filing-column-scroll";
const DEFAULT_VERTICAL_SCROLL_SELECTOR = `.${FILING_COLUMN_SCROLL_CLASS}`;
const COMPARE_COLUMN_SELECTOR = ".compare-column";
const HORIZONTAL_WHEEL_TRAP_SELECTOR = ".xbrl-metrics-scroll, .filing-table-wrap";

type WheelControlEvent = Pick<
  ReactWheelEvent<HTMLElement>,
  "deltaX" | "deltaY" | "shiftKey" | "preventDefault" | "stopPropagation" | "defaultPrevented"
>;

function hasHorizontalOverflow(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1;
}

function isHorizontalWheelIntent(el: HTMLElement, e: Pick<ReactWheelEvent<HTMLElement>, "deltaX" | "deltaY" | "shiftKey">): boolean {
  if (e.shiftKey) return true;
  if (!hasHorizontalOverflow(el)) return false;
  return Math.abs(e.deltaX) > Math.abs(e.deltaY);
}

function canScrollHorizontally(el: HTMLElement, scrollDelta: number): boolean {
  if (scrollDelta === 0) return false;

  const atLeft = el.scrollLeft <= 0;
  const atRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;

  if (scrollDelta < 0) return !atLeft;
  return !atRight;
}

function shouldReserveWheelForHorizontalScroll(
  trap: HTMLElement,
  e: Pick<ReactWheelEvent<HTMLElement>, "deltaX" | "deltaY" | "shiftKey">
): boolean {
  const horizontalDelta = e.shiftKey ? e.deltaY : e.deltaX;
  return isHorizontalWheelIntent(trap, e) && canScrollHorizontally(trap, horizontalDelta);
}

function verticalWheelDelta(e: Pick<ReactWheelEvent<HTMLElement>, "deltaY" | "shiftKey">): number {
  return e.shiftKey ? 0 : e.deltaY;
}

function applyVerticalScrollDelta(
  scrollEl: HTMLElement,
  deltaY: number,
  e: Pick<ReactWheelEvent<HTMLElement>, "preventDefault" | "stopPropagation">
): boolean {
  const maxScrollTop = scrollEl.scrollHeight - scrollEl.clientHeight;
  const nextScrollTop = Math.max(0, Math.min(maxScrollTop, scrollEl.scrollTop + deltaY));
  if (nextScrollTop === scrollEl.scrollTop) return false;

  scrollEl.scrollTop = nextScrollTop;
  e.preventDefault();
  e.stopPropagation();
  return true;
}

function forwardVerticalWheelFromTrapBubble(
  scrollEl: HTMLElement,
  target: Node,
  e: WheelControlEvent
): void {
  if (e.defaultPrevented) return;
  if (typeof (target as HTMLElement).closest !== "function") return;

  const trap = (target as HTMLElement).closest<HTMLElement>(HORIZONTAL_WHEEL_TRAP_SELECTOR);
  if (!trap) return;
  if (shouldReserveWheelForHorizontalScroll(trap, e)) return;

  const deltaY = verticalWheelDelta(e);
  if (Math.abs(deltaY) < 0.5) return;

  applyVerticalScrollDelta(scrollEl, deltaY, e);
}

/**
 * Attach wheel forwarding to filing excerpt table scroll wrappers (rendered via innerHTML).
 */
export function attachFilingTableWheelForwarding(root: HTMLElement | null): () => void {
  if (!root) return () => {};

  const wraps = root.querySelectorAll<HTMLElement>(".filing-table-wrap");
  const cleanups: Array<() => void> = [];

  wraps.forEach((wrap) => {
    const handler = (e: WheelEvent) => {
      const reactLike = {
        currentTarget: wrap,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        shiftKey: e.shiftKey,
        defaultPrevented: e.defaultPrevented,
        preventDefault: () => e.preventDefault(),
        stopPropagation: () => e.stopPropagation(),
      } as Parameters<typeof forwardVerticalWheelFromHorizontalScrollContainer>[0];

      const before = wrap.scrollLeft;
      forwardVerticalWheelFromHorizontalScrollContainer(reactLike);
      if (wrap.scrollLeft !== before) {
        e.preventDefault();
      }
    };

    wrap.addEventListener("wheel", handler, { passive: false });
    cleanups.push(() => wrap.removeEventListener("wheel", handler));
  });

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}

/**
 * Nested overflow-x containers capture wheel events even when they cannot scroll
 * vertically, which blocks touchpad/mouse vertical scroll in compare columns.
 * Forward dominant vertical wheel deltas to the column scroll parent while
 * preserving horizontal table scroll.
 */
export function forwardVerticalWheelFromHorizontalScrollContainer(
  e: ReactWheelEvent<HTMLElement>,
  verticalScrollSelector = DEFAULT_VERTICAL_SCROLL_SELECTOR
): void {
  const el = e.currentTarget;

  if (isHorizontalWheelIntent(el, e)) {
    const horizontalDelta = e.shiftKey ? e.deltaY : e.deltaX;
    if (canScrollHorizontally(el, horizontalDelta)) {
      return;
    }
  }

  const deltaY = verticalWheelDelta(e);
  if (Math.abs(deltaY) < 0.5) return;

  const verticalParent = el.closest(verticalScrollSelector) as HTMLElement | null;
  if (!verticalParent) return;

  applyVerticalScrollDelta(verticalParent, deltaY, e);
}

/**
 * Forward vertical wheel from compare column chrome (header, title bar) to the
 * column body scroll container. Events inside `.filing-column-scroll` are left
 * to native scroll unless they bubbled from a horizontal overflow trap that
 * could not scroll vertically.
 */
export function forwardVerticalWheelToFilingColumnScroll(
  e: ReactWheelEvent<HTMLElement>
): void {
  const columnRoot = e.currentTarget;
  const scrollEl = columnRoot.querySelector<HTMLElement>(DEFAULT_VERTICAL_SCROLL_SELECTOR);
  if (!scrollEl) return;

  const target = e.target as Node;
  if (scrollEl.contains(target) && target !== columnRoot) {
    forwardVerticalWheelFromTrapBubble(scrollEl, target, e);
    return;
  }

  const deltaY = verticalWheelDelta(e);
  if (Math.abs(deltaY) < 0.5) return;

  applyVerticalScrollDelta(scrollEl, deltaY, e);
}

/**
 * Forward vertical wheel from the multi-column horizontal strip when the pointer
 * is over non-scrollable grid chrome, while preserving horizontal column scroll.
 */
export function forwardVerticalWheelFromColumnsContainer(
  e: ReactWheelEvent<HTMLElement>
): void {
  const container = e.currentTarget;
  const target = e.target as HTMLElement;

  const columnScroll = target.closest<HTMLElement>(DEFAULT_VERTICAL_SCROLL_SELECTOR);
  if (columnScroll) {
    forwardVerticalWheelFromTrapBubble(columnScroll, target, e);
    return;
  }

  if (isHorizontalWheelIntent(container, e)) {
    const horizontalDelta = e.shiftKey ? e.deltaY : e.deltaX;
    if (canScrollHorizontally(container, horizontalDelta)) return;
  }

  const deltaY = verticalWheelDelta(e);
  if (Math.abs(deltaY) < 0.5) return;

  let column = target.closest<HTMLElement>(COMPARE_COLUMN_SELECTOR);
  if (!column && typeof document !== "undefined") {
    column =
      document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(COMPARE_COLUMN_SELECTOR) ??
      null;
  }
  if (!column) return;

  const scrollEl = column.querySelector<HTMLElement>(DEFAULT_VERTICAL_SCROLL_SELECTOR);
  if (!scrollEl) return;

  applyVerticalScrollDelta(scrollEl, deltaY, e);
}
