import { describe, expect, it, vi } from "vitest";
import {
  bumpScrollGeneration,
  getScrollGeneration,
  scrollMetricRowIntoViewWhenReady,
} from "@/lib/filing-column-scroll";

describe("filing-column-scroll generation", () => {
  it("bumpScrollGeneration advances the active generation", () => {
    const first = bumpScrollGeneration();
    const second = bumpScrollGeneration();
    expect(second).toBe(first + 1);
    expect(getScrollGeneration()).toBe(second);
  });

  it("scrollMetricRowIntoViewWhenReady stops retrying after generation bump", () => {
    const scrollEl = {
      querySelector: () => null,
      getBoundingClientRect: () => ({ top: 0, height: 100 }),
      scrollHeight: 100,
      clientHeight: 100,
      scrollTop: 0,
      scrollTo: vi.fn(),
    } as unknown as HTMLElement;

    const staleGeneration = bumpScrollGeneration();
    bumpScrollGeneration();

    const raf = vi.fn();
    const previousRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = raf as typeof requestAnimationFrame;

    try {
      scrollMetricRowIntoViewWhenReady(scrollEl, "revenue", 3, staleGeneration);
      expect(raf).not.toHaveBeenCalled();
    } finally {
      globalThis.requestAnimationFrame = previousRaf;
    }
  });
});
