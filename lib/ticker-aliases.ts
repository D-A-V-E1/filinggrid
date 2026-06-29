/**
 * Slug segment aliases for common company names that are not SEC ticker symbols.
 * Keys are lowercase slug tokens (one segment between "-vs-" delimiters).
 */
export const SLUG_TICKER_ALIASES: Readonly<Record<string, string>> = {
  tesla: "TSLA",
  google: "GOOGL",
  alphabet: "GOOGL",
  facebook: "META",
  amazon: "AMZN",
  apple: "AAPL",
  microsoft: "MSFT",
  nvidia: "NVDA",
  intel: "INTC",
  ford: "F",
  chevron: "CVX",
  exxon: "XOM",
  disney: "DIS",
  walmart: "WMT",
  berkshire: "BRK-B",
  cocacola: "KO",
  "coca-cola": "KO",
  pepsi: "PEP",
  pepsico: "PEP",
  netflix: "NFLX",
  salesforce: "CRM",
  servicenow: "NOW",
  shopify: "SHOP",
};

/** Map one compare-slug segment to an SEC ticker symbol. */
export function resolveSlugTicker(segment: string): string {
  const key = segment.trim().toLowerCase();
  if (!key) return "";
  return SLUG_TICKER_ALIASES[key] ?? key.toUpperCase();
}
