"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearAuthTokenCache, getAuthMe, type AuthMe } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/auth-config";
import { clearLocalSignOut, isLocalSignOut, setLocalSignOut } from "@/lib/local-sign-out";
import { clearAllOtpSession } from "@/lib/otp-session";
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

/** Clear local sign-out flag so an existing Supabase session can be used again. */
export async function resumeStoredSession(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user?.email?.trim() ?? null;
  if (!email) return null;
  clearLocalSignOut();
  clearAuthTokenCache();
  return email;
}

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

    let sessionEmail: string | null = null;
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) {
        clearAuthTokenCache();
        clearLocalSignOut();
      }
      sessionEmail = data.session?.user?.email ?? null;
    } catch {
      clearAuthTokenCache();
      sessionEmail = null;
    }

    if (isLocalSignOut()) {
      setSupabaseEmail(null);
      setAuth(EMPTY_AUTH);
      setLoading(false);
      return;
    }

    setSupabaseEmail(sessionEmail);

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

  /** Hide signed-in UI on this device; keep Supabase session for same-email return. */
  const signOut = useCallback(async () => {
    if (!configured) return;
    clearAuthTokenCache();
    clearAllOtpSession();
    setLocalSignOut(true);
    setAuth(EMPTY_AUTH);
    setSupabaseEmail(null);
  }, [configured]);

  /** Revoke Supabase session everywhere (requires a new magic link next time). */
  const signOutEverywhere = useCallback(async () => {
    if (!configured) return;
    clearAuthTokenCache();
    clearAllOtpSession();
    clearLocalSignOut();
    const supabase = createClient();
    await supabase.auth.signOut();
    await refresh();
  }, [configured, refresh]);

  const isSignedIn = Boolean(auth?.is_authenticated) && !isLocalSignOut();

  return {
    auth,
    supabaseEmail,
    loading,
    configured,
    isSignedIn,
    refresh,
    signOut,
    signOutEverywhere,
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
