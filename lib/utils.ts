import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { comparePathWithPeriod, resolveComparePeriod } from "@/lib/filing-period";
import { resolveSlugTicker } from "@/lib/ticker-aliases";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parsePeerSlug(slug: string): string[] {
  return slug
    .split("-vs-")
    .map((segment) => resolveSlugTicker(segment))
    .filter(Boolean);
}

export function buildPeerSlug(tickers: string[]): string {
  return tickers.map((t) => t.toLowerCase()).join("-vs-");
}

export function canonicalPeerSlug(slug: string): string {
  return buildPeerSlug(parsePeerSlug(slug));
}

export function isCanonicalPeerSlug(slug: string): boolean {
  return slug.toLowerCase() === canonicalPeerSlug(slug);
}

/** Canonical compare path, preserving year/period query params when present. */
export function canonicalComparePath(
  slug: string,
  year?: string,
  period?: string
): string {
  const canonical = canonicalPeerSlug(slug);
  const comparePeriod = resolveComparePeriod(year, period);
  return comparePathWithPeriod(canonical, comparePeriod);
}

export function normalizePeerSlug(tickers: string[]): string {
  return [...tickers].sort().map((t) => t.toLowerCase()).join("-vs-");
}

/** SEC ticker symbols are typically 1–5 letters; allow dots/hyphens for share classes. */
export function isValidTicker(ticker: string): boolean {
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker.toUpperCase());
}

export function validateCompareTickers(tickers: string[]): string | null {
  if (tickers.length === 0) {
    return "This comparison URL has no tickers. Use the search bar to build a valid compare link.";
  }
  if (tickers.length > 8) {
    return "This comparison URL has too many tickers (maximum 8).";
  }
  const invalid = tickers.find((t) => !isValidTicker(t));
  if (invalid) {
    return `"${invalid}" does not look like a valid ticker symbol.`;
  }
  return null;
}

// Reserved for a future enterprise tier (not enforced on Professional checkout).
export const CONSUMER_DOMAINS = [
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "icloud.com", "aol.com", "protonmail.com", "mail.com",
];

export function isCorporateEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && !CONSUMER_DOMAINS.includes(domain);
}

export const SECTION_EVENT = "filinggrid:section-select";
export const SCROLL_SYNC_EVENT = "filinggrid:scroll-sync";

export interface SectionSelectDetail {
  sectionId: string;
}

export interface ScrollSyncDetail {
  scrollTop: number;
  sourceId: string;
}

export function broadcastSectionSelect(sectionId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SectionSelectDetail>(SECTION_EVENT, { detail: { sectionId } })
  );
}

export function broadcastScrollSync(scrollTop: number, sourceId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ScrollSyncDetail>(SCROLL_SYNC_EVENT, { detail: { scrollTop, sourceId } })
  );
}
