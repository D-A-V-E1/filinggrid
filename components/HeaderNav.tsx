"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createPortal } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveTier } from "@/hooks/useEffectiveTier";
import SignInModal from "@/components/auth/SignInModal";

export default function HeaderNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { auth, loading, configured, isSignedIn, refresh, signOut } = useAuth();
  const { isPro } = useEffectiveTier(auth);
  const [signInOpen, setSignInOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

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
    try {
      const { portal_url } = await createPortal(returnPath);
      window.location.href = portal_url;
    } catch {
      setActionLoading(false);
    }
  }

  return (
    <>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/pricing" className="text-slate-600 hover:text-slate-900">
          Pricing
        </Link>

        {loading ? (
          <span className="text-slate-400">…</span>
        ) : isSignedIn && auth ? (
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
              title={auth.email ?? ""}
            >
              {auth.email}
            </Link>
            <Link href="/account" className="text-slate-600 hover:text-slate-900 sm:hidden">
              Account
            </Link>
            {isPro && (
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
