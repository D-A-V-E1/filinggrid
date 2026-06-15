import type { ParseResponse } from "./api";
import { normalizePeerSlug } from "./utils";

const META_PREFIX = "fg:meta:";

export function parseMetaCacheKey(tickers: string[], fiscalYear?: number): string {
  const slug = normalizePeerSlug(tickers);
  return `${META_PREFIX}${slug}:${fiscalYear ?? "current"}`;
}

/** True when at least one column has section HTML ready to render. */
export function hasRenderableSections(data: ParseResponse): boolean {
  return data.columns.some(
    (c) =>
      !c.error &&
      c.sections.length > 0 &&
      c.sections.some((s) => typeof s.html === "string" && s.html.length > 0)
  );
}

export function loadParseMeta(key: string): ParseResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as ParseResponse;
    if (!hasRenderableSections(data)) {
      sessionStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

export function saveParseMeta(key: string, data: ParseResponse): void {
  if (typeof window === "undefined") return;
  if (!hasRenderableSections(data)) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* quota exceeded — server disk cache still applies */
  }
}

export function clearParseMeta(key: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(key);
}
