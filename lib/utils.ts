import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parsePeerSlug(slug: string): string[] {
  return slug
    .split("-vs-")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
}

export function buildPeerSlug(tickers: string[]): string {
  return tickers.map((t) => t.toLowerCase()).join("-vs-");
}

export function normalizePeerSlug(tickers: string[]): string {
  return [...tickers].sort().map((t) => t.toLowerCase()).join("-vs-");
}

export const CONSUMER_DOMAINS = [
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "icloud.com", "aol.com", "protonmail.com",
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
