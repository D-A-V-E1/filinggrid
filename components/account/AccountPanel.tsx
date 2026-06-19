"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createCheckout, createPortal } from "@/lib/api";
import { isCorporateEmail } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveTier } from "@/hooks/useEffectiveTier";
import SignInModal from "@/components/auth/SignInModal";
import AccountWelcome from "@/components/account/AccountWelcome";

const WELCOME_DISMISSED_KEY = "filinggrid:welcome-dismissed";

export default function AccountPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { auth, loading, configured, isSignedIn, refresh, signOut } = useAuth();
  const { isPro } = useEffectiveTier(auth);
  const [signInOpen, setSignInOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);

  const welcomeTriggered =
    searchParams.get("welcome") === "1" ||
    searchParams.get("auth") === "success" ||
    searchParams.get("checkout") === "success";

  useEffect(() => {
    if (!isSignedIn || !welcomeTriggered) {
      setShowWelcome(false);
      return;
    }
    const dismissed = sessionStorage.getItem(WELCOME_DISMISSED_KEY) === "1";
    setShowWelcome(!dismissed);
  }, [isSignedIn, welcomeTriggered]);

  const dismissWelcome = useCallback(() => {
    sessionStorage.setItem(WELCOME_DISMISSED_KEY, "1");
    setShowWelcome(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("welcome");
    params.delete("auth");
    params.delete("checkout");
    const query = params.toString();
    router.replace(query ? `/account?${query}` : "/account");
  }, [router, searchParams]);

  async function handleSignOut() {
    setActionLoading(true);
    try {
      await signOut();
      router.refresh();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUpgrade() {
    setError("");
    if (auth?.email && !isCorporateEmail(auth.email)) {
      setError(
        "Professional requires a work email. Consumer providers (Gmail, Yahoo, Outlook personal, etc.) are not accepted."
      );
      return;
    }
    setActionLoading(true);
    try {
      const { checkout_url } = await createCheckout({ returnPath: "/account" });
      window.location.href = checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setActionLoading(false);
    }
  }

  async function handlePortal() {
    setActionLoading(true);
    setError("");
    try {
      const { portal_url } = await createPortal("/account");
      window.location.href = portal_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Billing portal unavailable");
      setActionLoading(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading account…</p>;
  }

  if (!configured) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <p className="font-medium">Authentication not configured</p>
        <p className="mt-2">
          Add your Supabase project URL and anon key to <code className="font-mono">.env</code> to
          enable sign-in. See the README Supabase setup section.
        </p>
      </div>
    );
  }

  if (!isSignedIn || !auth) {
    return (
      <>
        <div className="rounded-xl border border-slate-200 bg-white p-8">
          <h2 className="text-lg font-semibold text-slate-900">Sign in to your account</h2>
          <p className="mt-2 text-sm text-slate-600">
            Use a magic link to access saved peer groups, billing, and Professional features. The
            compare workspace is free without an account.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Professional checkout requires a <strong>work email</strong> (not Gmail, Yahoo, or other
            personal providers).
          </p>
          <button
            type="button"
            onClick={() => setSignInOpen(true)}
            className="mt-6 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Sign in with email
          </button>
        </div>
        <SignInModal
          open={signInOpen}
          returnPath="/account"
          onClose={() => setSignInOpen(false)}
          onSignedIn={() => refresh()}
        />
      </>
    );
  }

  const isProUser = isPro;

  return (
    <div className="space-y-6">
      {showWelcome && <AccountWelcome isPro={isProUser} onDismiss={dismissWelcome} />}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">Profile</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium text-slate-900">{auth.email}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Plan</dt>
            <dd className="font-medium capitalize text-slate-900">
              {isProUser ? "Professional" : "Free"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Compare limits</dt>
            <dd className="text-slate-700">
              {auth.limits.max_columns} columns
              {auth.limits.historical
                ? ", full filing archive & GAAP statements"
                : ", latest filing + last completed fiscal year"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">Billing</h2>
        {isProUser ? (
          <p className="mt-3 text-sm text-slate-600">
            Manage your subscription, invoices, and payment method in the Stripe Customer Portal.
          </p>
        ) : (
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <p>
              Upgrade to Professional for 8 columns, full GAAP statements, complete filing history,
              and saved peer groups.
            </p>
            <p className="text-xs text-slate-500">
              Checkout requires a <strong>work email</strong> (not Gmail, Yahoo, or other personal
              providers). This helps keep the product positioned for institutional analysts.
            </p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          {isProUser ? (
            <button
              type="button"
              onClick={handlePortal}
              disabled={actionLoading}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Manage billing
            </button>
          ) : (
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={actionLoading}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {actionLoading ? "Redirecting…" : "Upgrade to Professional"}
            </button>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={actionLoading}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Sign out
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      <p className="text-xs text-slate-500">
        <Link href="/compare/aapl-vs-msft" className="text-brand-700 hover:underline">
          Back to compare workspace
        </Link>
      </p>
    </div>
  );
}
