import { describe, expect, it, vi } from "vitest";
import {
  forwardVerticalWheelFromColumnsContainer,
  forwardVerticalWheelToFilingColumnScroll,
} from "@/lib/forward-vertical-wheel";

function wheelEvent(
  currentTarget: HTMLElement,
  target: EventTarget,
  deltaY = 40,
  clientX = 100,
  clientY = 100
) {
  return {
    currentTarget,
    target,
    deltaY,
    deltaX: 0,
    shiftKey: false,
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
      return node === body || node === el;
    },
    append: vi.fn(),
  };
  const body = { parentElement: el };
  return { el: el as unknown as HTMLElement, body: body as unknown as Node };
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

  it("does not intercept wheel events inside filing column scroll", () => {
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

  it("does not forward when the pointer is already over filing column scroll", () => {
    const { el: scrollEl } = mockScrollEl();
    const body = {
      closest: (selector: string) => (selector === ".filing-column-scroll" ? scrollEl : null),
    } as unknown as HTMLElement;
    const container = {
      scrollWidth: 100,
      clientWidth: 100,
      scrollLeft: 0,
    } as unknown as HTMLElement;

    const event = wheelEvent(container, body);
    forwardVerticalWheelFromColumnsContainer(event);

    expect(scrollEl.scrollTop).toBe(0);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
