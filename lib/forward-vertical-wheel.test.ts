import { describe, expect, it, vi } from "vitest";
import {
  forwardVerticalWheelFromColumnsContainer,
  forwardVerticalWheelFromHorizontalScrollContainer,
  forwardVerticalWheelToFilingColumnScroll,
} from "@/lib/forward-vertical-wheel";

function wheelEvent(
  currentTarget: HTMLElement,
  target: EventTarget,
  deltaY = 40,
  clientX = 100,
  clientY = 100,
  overrides: Partial<{
    deltaX: number;
    defaultPrevented: boolean;
  }> = {}
) {
  return {
    currentTarget,
    target,
    deltaY,
    deltaX: overrides.deltaX ?? 0,
    shiftKey: false,
    defaultPrevented: overrides.defaultPrevented ?? false,
    clientX,
    clientY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as Parameters<typeof forwardVerticalWheelToFilingColumnScroll>[0];
}

function mockScrollEl(scrollTop = 0, maxScroll = 200) {
  const el = {
    className: "filing-column-scroll",
    scrollHeight: maxScroll + 100,
    clientHeight: 100,
    scrollTop,
    contains(node: Node) {
      return node === body || node === el || node === trap;
    },
    append: vi.fn(),
  };
  const body = { parentElement: el };
  const trap = {
    className: "xbrl-metrics-scroll",
    scrollWidth: 200,
    clientWidth: 100,
    scrollLeft: 0,
    parentElement: body,
    closest(selector: string) {
      if (selector === ".filing-column-scroll") return el;
      if (selector === ".xbrl-metrics-scroll, .filing-table-wrap") return trap;
      return null;
    },
  };
  return {
    el: el as unknown as HTMLElement,
    body: body as unknown as Node,
    trap: trap as unknown as HTMLElement,
  };
}

describe("forwardVerticalWheelToFilingColumnScroll", () => {
  it("forwards vertical wheel from column header to filing column scroll", () => {
    const { el: scrollEl } = mockScrollEl();
    const header = {} as HTMLElement;
    const column = {
      querySelector: () => scrollEl,
      contains: () => false,
    } as unknown as HTMLElement;

    const event = wheelEvent(column, header);
    forwardVerticalWheelToFilingColumnScroll(event);

    expect(scrollEl.scrollTop).toBe(40);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it("keeps forwarding on repeated wheel events over column chrome", () => {
    const { el: scrollEl } = mockScrollEl();
    const header = {} as HTMLElement;
    const column = {
      querySelector: () => scrollEl,
      contains: () => false,
    } as unknown as HTMLElement;

    const first = wheelEvent(column, header);
    forwardVerticalWheelToFilingColumnScroll(first);
    expect(scrollEl.scrollTop).toBe(40);

    const second = wheelEvent(column, header);
    forwardVerticalWheelToFilingColumnScroll(second);

    expect(scrollEl.scrollTop).toBe(80);
    expect(second.preventDefault).toHaveBeenCalled();
  });

  it("does not intercept wheel events inside plain filing column scroll content", () => {
    const { el: scrollEl, body } = mockScrollEl();
    const column = {
      querySelector: () => scrollEl,
      contains: () => false,
    } as unknown as HTMLElement;

    const event = wheelEvent(column, body);
    forwardVerticalWheelToFilingColumnScroll(event);

    expect(scrollEl.scrollTop).toBe(0);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("forwards bubbled wheel events from horizontal traps that did not scroll", () => {
    const { el: scrollEl, trap } = mockScrollEl();
    const column = {
      querySelector: () => scrollEl,
      contains: () => false,
    } as unknown as HTMLElement;

    const event = wheelEvent(column, trap);
    forwardVerticalWheelToFilingColumnScroll(event);

    expect(scrollEl.scrollTop).toBe(40);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("does not double-forward when the trap handler already prevented default", () => {
    const { el: scrollEl, trap } = mockScrollEl(40);
    const column = {
      querySelector: () => scrollEl,
      contains: () => false,
    } as unknown as HTMLElement;

    const event = wheelEvent(column, trap, 40, 100, 100, { defaultPrevented: true });
    forwardVerticalWheelToFilingColumnScroll(event);

    expect(scrollEl.scrollTop).toBe(40);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe("forwardVerticalWheelFromHorizontalScrollContainer", () => {
  it("keeps forwarding vertical wheel across repeated events", () => {
    const { el: scrollEl, trap } = mockScrollEl();
    Object.defineProperty(trap, "closest", {
      value: (selector: string) => (selector === ".filing-column-scroll" ? scrollEl : null),
    });

    const first = wheelEvent(trap, trap);
    forwardVerticalWheelFromHorizontalScrollContainer(first);
    expect(scrollEl.scrollTop).toBe(40);

    const second = wheelEvent(trap, trap);
    forwardVerticalWheelFromHorizontalScrollContainer(second);
    expect(scrollEl.scrollTop).toBe(80);
  });
});

describe("forwardVerticalWheelFromColumnsContainer", () => {
  it("forwards vertical wheel from the columns strip to the column under the pointer", () => {
    const { el: scrollEl } = mockScrollEl();
    const column = {
      className: "compare-column",
      querySelector: () => scrollEl,
      closest: () => null,
    } as unknown as HTMLElement;
    const grid = {
      closest: (selector: string) => (selector === ".compare-column" ? column : null),
    } as unknown as HTMLElement;
    const container = {
      scrollWidth: 100,
      clientWidth: 100,
      scrollLeft: 0,
    } as unknown as HTMLElement;

    const event = wheelEvent(container, grid);

    forwardVerticalWheelFromColumnsContainer(event);

    expect(scrollEl.scrollTop).toBe(40);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("does not forward when the pointer is over plain filing column scroll content", () => {
    const { el: scrollEl, body } = mockScrollEl();
    const bodyTarget = {
      closest: (selector: string) => (selector === ".filing-column-scroll" ? scrollEl : null),
    } as unknown as HTMLElement;
    const container = {
      scrollWidth: 100,
      clientWidth: 100,
      scrollLeft: 0,
    } as unknown as HTMLElement;

    const event = wheelEvent(container, bodyTarget);
    forwardVerticalWheelFromColumnsContainer(event);

    expect(scrollEl.scrollTop).toBe(0);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("forwards bubbled wheel events from horizontal traps inside a column", () => {
    const { el: scrollEl, trap } = mockScrollEl();
    const container = {
      scrollWidth: 100,
      clientWidth: 100,
      scrollLeft: 0,
    } as unknown as HTMLElement;

    const event = wheelEvent(container, trap);
    forwardVerticalWheelFromColumnsContainer(event);

    expect(scrollEl.scrollTop).toBe(40);
    expect(event.preventDefault).toHaveBeenCalled();
  });
});
