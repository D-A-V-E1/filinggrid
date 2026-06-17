"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuthMe } from "@/lib/api";
import {
  DEV_TIER_CHANGE_EVENT,
  getEffectiveLimits,
  getEffectiveTier,
  isDevTierToggleEnabled,
} from "@/lib/dev-tier";

/** Resolves tier/limits for UI gates, honoring dev override immediately on toggle. */
export function useEffectiveTier(auth?: AuthMe | null) {
  const [devTierVersion, setDevTierVersion] = useState(0);

  useEffect(() => {
    if (!isDevTierToggleEnabled()) return;
    const bump = () => setDevTierVersion((v) => v + 1);
    window.addEventListener(DEV_TIER_CHANGE_EVENT, bump);
    return () => window.removeEventListener(DEV_TIER_CHANGE_EVENT, bump);
  }, []);

  return useMemo(() => {
    void devTierVersion;
    const tier = getEffectiveTier(auth?.tier);
    const limits = getEffectiveLimits(auth);
    return {
      tier,
      limits,
      isPro: tier === "professional",
      maxColumns: limits.max_columns,
    };
  }, [auth, devTierVersion]);
}
