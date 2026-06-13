"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createCheckout, createPortal, getAuthMe, type AuthMe } from "@/lib/api";
import { isCorporateEmail } from "@/lib/utils";

interface PaywallModalProps {
  open: boolean;
  reason: string;
  message: string;
  onClose: () => void;
}

export default function PaywallModal({ open, reason, message, onClose }: PaywallModalProps) {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "magic-link" | "checkout">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [auth, setAuth] = useState<AuthMe | null>(null);

  useEffect(() => {
    if (open) {
      getAuthMe()
        .then((me) => {
          setAuth(me);
          if (me.is_authenticated) setStep("checkout");
        })
        .catch(() => setAuth(null));
    }
  }, [open]);

  if (!open) return null;

  async function handleMagicLink() {
    setError("");
    if (!isCorporateEmail(email)) {
      setError("Professional tier requires a corporate email address.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (authError) throw authError;
      setStep("magic-link");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send magic link");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout() {
    setLoading(true);
    setError("");
    try {
      const { checkout_url } = await createCheckout(email || auth?.email || undefined);
      window.location.href = checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setLoading(false);
    }
  }

  async function handlePortal() {
    setLoading(true);
    try {
      const { portal_url } = await createPortal();
      window.location.href = portal_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Portal unavailable");
      setLoading(false);
    }
  }

  const reasonLabel =
    reason === "column_limit"
      ? "Compare more tickers"
      : reason === "historical_data"
        ? "Access historical filings"
        : "Upgrade to Professional";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
          aria-label="Close"
        >
          ×
        </button>

        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
            Professional · $29/mo
          </p>
          <h2 id="paywall-title" className="mt-2 text-xl font-semibold text-slate-900">
            {reasonLabel}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{message}</p>
        </div>

        <ul className="mb-6 space-y-2 text-sm text-slate-600">
          <li className="flex items-center gap-2">
            <span className="text-brand-600">✓</span> Up to 8 concurrent ticker columns
          </li>
          <li className="flex items-center gap-2">
            <span className="text-brand-600">✓</span> Historical 10-K &amp; 10-Q filings
          </li>
          <li className="flex items-center gap-2">
            <span className="text-brand-600">✓</span> Saved peer groups
          </li>
          <li className="flex items-center gap-2">
            <span className="text-brand-600">✓</span> Self-serve billing via Stripe
          </li>
        </ul>

        {step === "email" && !auth?.is_authenticated && (
          <div className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="button"
              onClick={handleMagicLink}
              disabled={loading || !email}
              className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </div>
        )}

        {step === "magic-link" && (
          <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-800">
            Check your inbox for a sign-in link. After signing in, return here to complete checkout.
          </div>
        )}

        {(auth?.is_authenticated || step === "checkout") && (
          <div className="space-y-3">
            {auth?.is_authenticated && (
              <p className="text-sm text-slate-600">
                Signed in as <span className="font-medium">{auth.email}</span>
              </p>
            )}
            {auth?.tier === "professional" ? (
              <button
                type="button"
                onClick={handlePortal}
                disabled={loading}
                className="w-full rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Manage subscription
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCheckout}
                disabled={loading}
                className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? "Redirecting…" : "Continue to Stripe Checkout →"}
              </button>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
