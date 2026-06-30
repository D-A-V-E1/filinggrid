import { describe, expect, it } from "vitest";
import { resolveSlugTicker } from "@/lib/ticker-aliases";
import {
  buildPeerSlug,
  canonicalPeerSlug,
  isCanonicalPeerSlug,
  parsePeerSlug,
  validateCompareTickers,
} from "@/lib/utils";

describe("parsePeerSlug", () => {
  it("parses standard ticker slugs", () => {
    expect(parsePeerSlug("aapl-vs-msft-vs-nvda")).toEqual(["AAPL", "MSFT", "NVDA"]);
    expect(parsePeerSlug("tsla-vs-f")).toEqual(["TSLA", "F"]);
  });

  it("resolves company-name slug segments to SEC tickers", () => {
    expect(parsePeerSlug("tesla-vs-f-vs-gm")).toEqual(["TSLA", "F", "GM"]);
    expect(resolveSlugTicker("tesla")).toBe("TSLA");
    expect(resolveSlugTicker("google")).toBe("GOOGL");
    expect(resolveSlugTicker("ford")).toBe("F");
  });

  it("passes validateCompareTickers for tesla-vs-f-vs-gm", () => {
    const tickers = parsePeerSlug("tesla-vs-f-vs-gm");
    expect(validateCompareTickers(tickers)).toBeNull();
  });
});

describe("canonicalPeerSlug", () => {
  it("normalizes alias slugs to lowercase ticker symbols", () => {
    expect(canonicalPeerSlug("tesla-vs-f-vs-gm")).toBe("tsla-vs-f-vs-gm");
    expect(buildPeerSlug(parsePeerSlug("tesla-vs-f-vs-gm"))).toBe("tsla-vs-f-vs-gm");
  });

  it("detects non-canonical slugs that need redirect", () => {
    expect(isCanonicalPeerSlug("tesla-vs-f-vs-gm")).toBe(false);
    expect(isCanonicalPeerSlug("tsla-vs-f-vs-gm")).toBe(true);
    expect(isCanonicalPeerSlug("aapl-vs-msft")).toBe(true);
  });
});
