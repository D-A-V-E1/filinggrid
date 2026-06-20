/** Dev-only tier override for local QA. Stripped from production when env flags are unset. */

import type { AuthMe } from "@/lib/api";

export type DevTier = "free" | "professional";

const STORAGE_KEY = "fg-dev-tier";

export const DEV_TIER_CHANGE_EVENT = "fg-dev-tier-change";

export const TIER_LIMITS = {
  free: {
    max_columns: 3,
    historical: false,
    current_year_only: true,
  },
  professional: {
    max_columns: 8,
    historical: true,
    current_year_only: false,
  },
} as const;

export type TierLimits = (typeof TIER_LIMITS)[DevTier];

let authTierForDevGate: string | null = null;

/** Updated when `/auth/me` resolves so API calls can skip `X-Dev-Tier` for real subscribers. */
export function setAuthTierForDevGate(tier: string | null): void {
  authTierForDevGate = tier;
}

/** True when the in-app dev tier toggle may render and API headers may be sent. */
export function isDevTierToggleEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return process.env.NEXT_PUBLIC_ALLOW_DEV_TIER_TOGGLE === "true";
}

/** Paid Professional tier from Stripe webhook (`/auth/me`), not a dev override. */
export function hasRealProfessionalSubscription(authTier?: string | null): boolean {
  return authTier === "professional";
}

/**
 * Dev tier UI is for local QA on free accounts only.
 * Real subscribers should never see the override toggle or send `X-Dev-Tier`.
 */
export function shouldShowDevTierUI(authTier?: string | null): boolean {
  return isDevTierToggleEnabled() && !hasRealProfessionalSubscription(authTier);
}

export function clearDevTierOverride(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function getDevTierFromStorage(): DevTier | null {
  if (typeof window === "undefined" || !isDevTierToggleEnabled()) return null;
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored === "free" || stored === "professional") return stored;
  return null;
}

export function setDevTierInStorage(tier: DevTier): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, tier);
}

/** Tier sent as `X-Dev-Tier` when an explicit dev override is active. */
export function getDevTierForApiHeader(authTier?: string | null): DevTier | null {
  const resolvedAuthTier = authTier ?? authTierForDevGate;
  if (!shouldShowDevTierUI(resolvedAuthTier)) return null;

  const stored = getDevTierFromStorage();
  if (stored) return stored;

  const envTier = process.env.NEXT_PUBLIC_DEV_TIER;
  if (envTier === "free" || envTier === "professional") return envTier;

  return null;
}

/** Client-side tier for UI gates — real subscription wins; dev override applies for free-tier QA only. */
export function getEffectiveTier(authTier?: string | null): DevTier {
  if (hasRealProfessionalSubscription(authTier)) return "professional";
  const devTier = getDevTierForApiHeader(authTier);
  if (devTier) return devTier;
  return "free";
}

export function isProfessionalTier(authTier?: string | null): boolean {
  return getEffectiveTier(authTier) === "professional";
}

/** Limits aligned with backend `TIER_LIMITS` for the resolved effective tier. */
export function getEffectiveLimits(auth?: AuthMe | null): TierLimits {
  const tier = getEffectiveTier(auth?.tier);
  return TIER_LIMITS[tier];
}
