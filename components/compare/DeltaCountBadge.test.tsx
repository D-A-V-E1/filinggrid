import { describe, expect, it } from "vitest";
import { monotonicDeltaDisplayCount } from "./DeltaCountBadge";

describe("DeltaCountBadge monotonic display", () => {
  it("never decreases while loading", () => {
    let display = monotonicDeltaDisplayCount(0, 5, true, 0);
    expect(display).toBe(5);

    display = monotonicDeltaDisplayCount(display, 0, true, 5);
    expect(display).toBe(5);

    display = monotonicDeltaDisplayCount(display, 3, true, 5);
    expect(display).toBe(5);

    display = monotonicDeltaDisplayCount(display, 7, true, 5);
    expect(display).toBe(7);
  });

  it("resets to zero only after loading completes with no floor", () => {
    let display = monotonicDeltaDisplayCount(0, 4, true, 0);
    expect(display).toBe(4);

    display = monotonicDeltaDisplayCount(display, 0, false, 0);
    expect(display).toBe(0);
  });

  it("honors count floor on remount when count has not caught up", () => {
    expect(monotonicDeltaDisplayCount(32, 0, false, 32)).toBe(32);
    expect(monotonicDeltaDisplayCount(0, 0, false, 32)).toBe(32);
  });

  it("shows settled count even if prev was higher during scan", () => {
    expect(monotonicDeltaDisplayCount(32, 10, false, 0)).toBe(10);
  });

  it("resets to zero when loading restarts with no floor", () => {
    expect(monotonicDeltaDisplayCount(32, 0, true, 0)).toBe(0);
  });

  it("does not re-apply stale floor after scan settles", () => {
    expect(monotonicDeltaDisplayCount(27, 26, false, 27)).toBe(26);
    expect(monotonicDeltaDisplayCount(27, 26, false, 0)).toBe(26);
  });
});
