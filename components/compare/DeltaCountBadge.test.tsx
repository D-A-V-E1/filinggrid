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

  it("resets to zero only after loading completes", () => {
    let display = monotonicDeltaDisplayCount(0, 4, true, 0);
    expect(display).toBe(4);

    display = monotonicDeltaDisplayCount(display, 0, false, 4);
    expect(display).toBe(0);
  });
});
