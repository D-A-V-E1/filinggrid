import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchSectionHtmlDeduped, prefetchSectionHtml, readCachedSectionHtml } from "./section-html";

vi.mock("./api", () => ({
  ApiError: class ApiError extends Error {
    isPaywall = false;
    status = 500;
    constructor(message: string) {
      super(message);
    }
  },
  fetchSectionHtml: vi.fn(),
}));

vi.mock("./parse-cache", () => ({
  loadSectionHtml: vi.fn(),
  saveSectionHtml: vi.fn(),
}));

import { fetchSectionHtml } from "./api";
import { loadSectionHtml, saveSectionHtml } from "./parse-cache";

const mockFetch = vi.mocked(fetchSectionHtml);
const mockLoad = vi.mocked(loadSectionHtml);
const mockSave = vi.mocked(saveSectionHtml);

const req = {
  ticker: "AAPL",
  sectionId: "item-1",
  fiscalYear: 2024,
  period: "annual-2024",
  filingCacheKey: "AAPL:2024:000032019324000123",
  sessionCacheKey: "AAPL:2024:000032019324000123",
};

describe("section-html", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoad.mockReturnValue(null);
    mockFetch.mockResolvedValue("<p>excerpt</p>");
  });

  it("returns session cache without network", async () => {
    mockLoad.mockReturnValue("<p>cached</p>");
    expect(readCachedSectionHtml(req)).toBe("<p>cached</p>");
    await expect(fetchSectionHtmlDeduped(req)).resolves.toBe("<p>cached</p>");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("dedupes concurrent fetches for the same section", async () => {
    let resolve!: (value: string) => void;
    mockFetch.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );

    const first = fetchSectionHtmlDeduped(req);
    const second = fetchSectionHtmlDeduped(req);
    resolve("<p>excerpt</p>");

    await expect(Promise.all([first, second])).resolves.toEqual([
      "<p>excerpt</p>",
      "<p>excerpt</p>",
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith(req.sessionCacheKey, req.sectionId, "<p>excerpt</p>");
  });

  it("prefetch is a no-op when session cache hits", () => {
    mockLoad.mockReturnValue("<p>cached</p>");
    prefetchSectionHtml(req);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
