import { ApiError, fetchSectionHtml } from "./api";
import { sanitizeExcerptHtml } from "./sanitize-excerpt-html";
import { loadSectionHtml, saveSectionHtml } from "./parse-cache";

export interface SectionHtmlRequest {
  ticker: string;
  sectionId: string;
  fiscalYear?: number | null;
  period?: string | null;
  /** Backend filing cache key from parse column metadata. */
  filingCacheKey?: string | null;
  /** Session storage key (column cache_key) for excerpt HTML. */
  sessionCacheKey?: string | null;
}

function requestKey(req: SectionHtmlRequest): string {
  return [
    req.ticker.toUpperCase(),
    req.sectionId,
    req.fiscalYear ?? "",
    req.period ?? "",
    req.filingCacheKey ?? "",
  ].join("|");
}

const inflight = new Map<string, Promise<string>>();

export function readCachedSectionHtml(req: SectionHtmlRequest): string | null {
  if (!req.sessionCacheKey) return null;
  return loadSectionHtml(req.sessionCacheKey, req.sectionId);
}

/** Deduped section HTML fetch with session-cache write-through. */
export function fetchSectionHtmlDeduped(req: SectionHtmlRequest): Promise<string> {
  const cached = readCachedSectionHtml(req);
  if (cached) return Promise.resolve(cached);

  const key = requestKey(req);
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = fetchSectionHtml(
    req.ticker,
    req.sectionId,
    req.fiscalYear,
    req.period,
    req.filingCacheKey
  )
    .then((html) => {
      const safe = sanitizeExcerptHtml(html);
      if (req.sessionCacheKey && safe?.trim()) {
        saveSectionHtml(req.sessionCacheKey, req.sectionId, safe);
      }
      return safe;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/** Background prefetch; ignores paywall, 404, and transient server errors. */
export function prefetchSectionHtml(req: SectionHtmlRequest): void {
  if (readCachedSectionHtml(req)) return;
  void fetchSectionHtmlDeduped(req).catch((err) => {
    if (err instanceof ApiError && (err.isPaywall || err.status === 404)) return;
    if (err instanceof ApiError && err.status >= 500) return;
  });
}
