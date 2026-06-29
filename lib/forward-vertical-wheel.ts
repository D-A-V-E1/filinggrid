import type { WheelEvent as ReactWheelEvent } from "react";

const DEFAULT_VERTICAL_SCROLL_SELECTOR = ".filing-column-scroll";

function hasHorizontalOverflow(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1;
}

function isHorizontalWheelIntent(el: HTMLElement, e: ReactWheelEvent<HTMLElement>): boolean {
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
        preventDefault: () => e.preventDefault(),
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

  const deltaY = e.shiftKey ? 0 : e.deltaY;
  if (Math.abs(deltaY) < 0.5) return;

  const verticalParent = el.closest(verticalScrollSelector) as HTMLElement | null;
  if (!verticalParent) return;

  const maxScrollTop = verticalParent.scrollHeight - verticalParent.clientHeight;
  const nextScrollTop = Math.max(0, Math.min(maxScrollTop, verticalParent.scrollTop + deltaY));

  if (nextScrollTop === verticalParent.scrollTop) return;

  verticalParent.scrollTop = nextScrollTop;
  e.preventDefault();
}
