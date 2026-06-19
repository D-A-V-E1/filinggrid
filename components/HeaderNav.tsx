"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "@/lib/api";
import { AUTH_SIGN_IN_REQUEST_EVENT } from "@/lib/auth-errors";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveTier } from "@/hooks/useEffectiveTier";
import SignInModal from "@/components/auth/SignInModal";

export default function HeaderNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { auth, loading, configured, isSignedIn, supabaseEmail, refresh, signOut } = useAuth();
  const { isPro } = useEffectiveTier(auth);
  const hasSession = isSignedIn || Boolean(supabaseEmail);
  const displayEmail = auth?.email ?? supabaseEmail;
  const [signInOpen, setSignInOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const hasRealSubscription = auth?.tier === "professional";

  useEffect(() => {
    function openSignIn() {
      setSignInOpen(true);
    }
    window.addEventListener(AUTH_SIGN_IN_REQUEST_EVENT, openSignIn);
    return () => window.removeEventListener(AUTH_SIGN_IN_REQUEST_EVENT, openSignIn);
  }, []);

  const returnPath =
    pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");

  async function handleSignOut() {
    setActionLoading(true);
    try {
      await signOut();
      router.refresh();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleManageBilling() {
    setActionLoading(true);
    setError("");
    try {
      const { portal_url } = await createPortal(returnPath);
      window.location.href = portal_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Billing portal unavailable");
      setActionLoading(false);
    }
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="text-slate-600 hover:text-slate-900">
            Pricing
          </Link>

          {loading ? (
            <span className="text-slate-400">…</span>
          ) : hasSession && displayEmail ? (
            <div className="flex items-center gap-3">
              {isPro ? (
                <span className="hidden rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 sm:inline">
                  Pro
                </span>
              ) : (
                <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 sm:inline">
                  Free
                </span>
              )}
              <Link
                href="/account"
                className="hidden max-w-[140px] truncate text-slate-600 hover:text-slate-900 sm:inline"
                title={displayEmail}
              >
                {displayEmail}
              </Link>
              <Link href="/account" className="text-slate-600 hover:text-slate-900 sm:hidden">
                Account
              </Link>
              {hasRealSubscription && (
                <button
                  type="button"
                  onClick={handleManageBilling}
                  disabled={actionLoading}
                  className="text-slate-600 hover:text-slate-900 disabled:opacity-50"
                >
                  Billing
                </button>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                disabled={actionLoading}
                className="text-slate-600 hover:text-slate-900 disabled:opacity-50"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSignInOpen(true)}
              className="text-slate-600 hover:text-slate-900"
              title={configured ? undefined : "Supabase not configured"}
            >
              Sign in
            </button>
          )}

          <Link
            href="/compare/aapl-vs-msft"
            className="rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700"
          >
            Try demo
          </Link>
        </nav>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <SignInModal
        open={signInOpen}
        returnPath={returnPath}
        onClose={() => setSignInOpen(false)}
        onSignedIn={() => {
          refresh();
          router.refresh();
        }}
      />
    </>
  );
}
