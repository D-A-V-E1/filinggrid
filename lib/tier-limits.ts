/** User-facing copy for subscription column limits. */

export const ABSOLUTE_MAX_COLUMNS = 8;

export function getMaxColumns(tier: string | undefined, limitFromAuth?: number): number {
  if (typeof limitFromAuth === "number" && limitFromAuth > 0) return limitFromAuth;
  return tier === "professional" ? 8 : 3;
}

/** Shown when the user tries to add one ticker over their plan limit. */
export function addTickerLimitMessage(tier: string, maxColumns: number): string {
  if (tier === "professional") {
    return `Professional supports up to ${maxColumns} tickers. Remove one to add another.`;
  }
  return `Free tier supports up to ${maxColumns} tickers. Upgrade to Professional for up to 8.`;
}

/** Shown when a compare URL exceeds the user's plan (paywall / banner). */
export function compareUrlLimitMessage(tier: string, maxColumns: number, tickerCount: number): string {
  if (tickerCount > ABSOLUTE_MAX_COLUMNS) {
    return `Comparisons support a maximum of ${ABSOLUTE_MAX_COLUMNS} tickers.`;
  }
  if (tier === "professional") {
    return `Professional supports up to ${maxColumns} tickers. Remove ${tickerCount - maxColumns} ticker${tickerCount - maxColumns === 1 ? "" : "s"} to continue.`;
  }
  return `Free tier supports up to ${maxColumns} tickers. Upgrade to Professional for up to 8.`;
}
