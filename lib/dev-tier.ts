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

/** True when the in-app dev tier toggle may render and API headers may be sent. */
export function isDevTierToggleEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return process.env.NEXT_PUBLIC_ALLOW_DEV_TIER_TOGGLE === "true";
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
export function getDevTierForApiHeader(): DevTier | null {
  if (!isDevTierToggleEnabled()) return null;

  const stored = getDevTierFromStorage();
  if (stored) return stored;

  const envTier = process.env.NEXT_PUBLIC_DEV_TIER;
  if (envTier === "free" || envTier === "professional") return envTier;

  return null;
}

/** Client-side tier for UI gates — dev override wins over `/auth/me` until refresh completes. */
export function getEffectiveTier(authTier?: string | null): DevTier {
  const devTier = getDevTierForApiHeader();
  if (devTier) return devTier;
  return authTier === "professional" ? "professional" : "free";
}

export function isProfessionalTier(authTier?: string | null): boolean {
  return getEffectiveTier(authTier) === "professional";
}

/** Limits aligned with backend `TIER_LIMITS`, preferring `/auth/me` when tier matches. */
export function getEffectiveLimits(auth?: AuthMe | null): TierLimits {
  const tier = getEffectiveTier(auth?.tier);
  if (auth?.tier === tier && auth.limits) {
    return auth.limits as TierLimits;
  }
  return TIER_LIMITS[tier];
}
