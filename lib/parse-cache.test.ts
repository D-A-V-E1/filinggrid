import { describe, expect, it, beforeEach, vi } from "vitest";
import type { ParseResponse } from "./api";
import {
  hasColumnParseErrors,
  isRetriableParseError,
  loadParseMeta,
  parseMetaCacheKey,
  saveParseMeta,
} from "./parse-cache";

const storage = new Map<string, string>();

vi.stubGlobal("window", globalThis);
vi.stubGlobal("sessionStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => {
    storage.clear();
  },
});

const META_KEY = parseMetaCacheKey(["NVDA", "AMD", "INTC"], { period: "annual-2025" });

function sampleParse(overrides?: Partial<ParseResponse>): ParseResponse {
  return {
    columns: [
      {
        ticker: "NVDA",
        company_name: "NVIDIA",
        cik: "1",
        form: "10-K",
        filing_date: "2025-02-01",
        report_date: "2025-01-26",
        fiscal_year: 2025,
        sections: [{ id: "business", label: "Business", heading: "", text_preview: "x" }],
        error: null,
      },
      {
        ticker: "AMD",
        company_name: "AMD",
        cik: "2",
        form: null,
        filing_date: null,
        report_date: null,
        fiscal_year: 2025,
        sections: [],
        error: "Compressed file ended before the end-of-stream marker was reached.",
      },
    ],
    section_catalog: [{ id: "business", label: "Business" }],
    parsed_at: "2026-06-29T00:00:00.000Z",
    stateless: false,
    ...overrides,
  };
}

describe("parse-cache column errors", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("detects column parse errors", () => {
    expect(hasColumnParseErrors(sampleParse())).toBe(true);
    expect(hasColumnParseErrors(sampleParse({ columns: sampleParse().columns.slice(0, 1) }))).toBe(false);
  });

  it("does not persist compare meta when a column failed", () => {
    saveParseMeta(META_KEY, sampleParse());
    expect(sessionStorage.getItem(META_KEY)).toBeNull();
  });

  it("drops cached meta with column errors so refresh refetches", () => {
    sessionStorage.setItem(META_KEY, JSON.stringify(sampleParse()));
    expect(loadParseMeta(META_KEY)).toBeNull();
    expect(sessionStorage.getItem(META_KEY)).toBeNull();
  });

  it("classifies gzip corruption as retriable", () => {
    expect(
      isRetriableParseError("Compressed file ended before the end-of-stream marker was reached.")
    ).toBe(true);
    expect(isRetriableParseError("No comparable filing found")).toBe(false);
  });
});
