"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearAuthTokenCache, getAuthMe, type AuthMe } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/auth-config";
import { DEV_TIER_CHANGE_EVENT, isDevTierToggleEnabled } from "@/lib/dev-tier";

const EMPTY_AUTH: AuthMe = {
  email: null,
  tier: "free",
  is_authenticated: false,
  limits: {
    max_columns: 3,
    historical: false,
    current_year_only: true,
  },
  organization_id: null,
};

export function useAuth() {
  const [auth, setAuth] = useState<AuthMe | null>(null);
  const [supabaseEmail, setSupabaseEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured] = useState(isSupabaseConfigured);

  const refresh = useCallback(async () => {
    if (!configured) {
      setAuth(EMPTY_AUTH);
      setSupabaseEmail(null);
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) {
        clearAuthTokenCache();
      }
      setSupabaseEmail(data.session?.user?.email ?? null);
    } catch {
      clearAuthTokenCache();
      setSupabaseEmail(null);
    }

    try {
      const me = await getAuthMe();
      setAuth(me);
    } catch {
      setAuth(EMPTY_AUTH);
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    refresh();
    if (!configured) return;

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });
    return () => subscription.unsubscribe();
  }, [configured, refresh]);

  useEffect(() => {
    if (!isDevTierToggleEnabled()) return;
    const onDevTierChange = () => {
      void refresh();
    };
    window.addEventListener(DEV_TIER_CHANGE_EVENT, onDevTierChange);
    return () => window.removeEventListener(DEV_TIER_CHANGE_EVENT, onDevTierChange);
  }, [refresh]);

  const signOut = useCallback(async () => {
    if (!configured) return;
    clearAuthTokenCache();
    const supabase = createClient();
    await supabase.auth.signOut();
    await refresh();
  }, [configured, refresh]);

  const isSignedIn = Boolean(auth?.is_authenticated);

  return {
    auth,
    supabaseEmail,
    loading,
    configured,
    isSignedIn,
    refresh,
    signOut,
  };
}

/** Poll until backend recognizes the Supabase session (after magic-link click). */
export async function waitForBackendAuth(
  maxAttempts = 30,
  intervalMs = 2000
): Promise<AuthMe | null> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const me = await getAuthMe();
      if (me.is_authenticated) return me;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}
