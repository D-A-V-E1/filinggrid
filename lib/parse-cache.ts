import type { ParseResponse } from "./api";
import { normalizePeerSlug } from "./utils";

const META_PREFIX = "fg:meta:";
const SECTION_PREFIX = "fg:section:";
const SECTION_TEXT_PREFIX = "fg:section-text:";

export function parseMetaCacheKey(tickers: string[], fiscalYear?: number): string {
  const slug = normalizePeerSlug(tickers);
  return `${META_PREFIX}${slug}:${fiscalYear ?? "current"}`;
}

function sectionHtmlCacheKey(cacheKey: string, sectionId: string): string {
  return `${SECTION_PREFIX}${cacheKey}:${sectionId}`;
}

function sectionTextCacheKey(cacheKey: string, sectionId: string): string {
  return `${SECTION_TEXT_PREFIX}${cacheKey}:${sectionId}`;
}

/** True when at least one column has section metadata for navigation. */
export function hasSectionIndex(data: ParseResponse): boolean {
  return data.columns.some((c) => !c.error && c.sections.length > 0);
}

/** @deprecated Use hasSectionIndex — kept for callers checking inline HTML. */
export function hasRenderableSections(data: ParseResponse): boolean {
  const hasHtml = data.columns.some(
    (c) =>
      !c.error &&
      c.sections.length > 0 &&
      c.sections.some((s) => typeof s.html === "string" && s.html.length > 0)
  );
  return hasHtml || hasSectionIndex(data);
}

/** @deprecated Use hasSectionIndex — kept for imports during transition. */
export const hasParsedColumns = hasSectionIndex;

export function loadParseMeta(key: string): ParseResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as ParseResponse;
    if (!hasSectionIndex(data)) {
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
  if (!hasSectionIndex(data)) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* quota exceeded — server disk cache still applies */
  }
}

export function loadSectionHtml(cacheKey: string, sectionId: string): string | null {
  if (typeof window === "undefined" || !cacheKey) return null;
  try {
    return sessionStorage.getItem(sectionHtmlCacheKey(cacheKey, sectionId));
  } catch {
    return null;
  }
}

export function saveSectionHtml(cacheKey: string, sectionId: string, html: string): void {
  if (typeof window === "undefined" || !cacheKey || !html) return;
  try {
    sessionStorage.setItem(sectionHtmlCacheKey(cacheKey, sectionId), html);
  } catch {
    /* quota exceeded */
  }
}

export function loadSectionText(cacheKey: string, sectionId: string): string | null {
  if (typeof window === "undefined" || !cacheKey) return null;
  try {
    return sessionStorage.getItem(sectionTextCacheKey(cacheKey, sectionId));
  } catch {
    return null;
  }
}

export function saveSectionText(cacheKey: string, sectionId: string, text: string): void {
  if (typeof window === "undefined" || !cacheKey || !text) return;
  try {
    sessionStorage.setItem(sectionTextCacheKey(cacheKey, sectionId), text);
  } catch {
    /* quota exceeded */
  }
}

export function clearParseMeta(key: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(key);
}
