"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import MagicLinkForm from "@/components/auth/MagicLinkForm";
import { createCheckout, createPortal } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveTier } from "@/hooks/useEffectiveTier";

interface PaywallModalProps {
  open: boolean;
  reason: string;
  message: string;
  onClose: () => void;
}

function PaywallModalInner({ open, reason, message, onClose }: PaywallModalProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnPath =
    pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");

  const { auth, isSignedIn, refresh } = useAuth();
  const { isPro } = useEffectiveTier(auth);
  const [showCheckout, setShowCheckout] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (open) {
      refresh();
      setShowCheckout(false);
      setError("");
      setFormKey((k) => k + 1);
    }
  }, [open, refresh]);

  useEffect(() => {
    if (open && isSignedIn) {
      setShowCheckout(true);
    }
  }, [open, isSignedIn]);

  useEffect(() => {
    if (open && isPro) {
      onClose();
    }
  }, [open, isPro, onClose]);

  if (!open || isPro) return null;

  async function handleCheckout() {
    setLoading(true);
    setError("");
    try {
      const { checkout_url } = await createCheckout({
        email: auth?.email || undefined,
        returnPath,
      });
      window.location.href = checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setLoading(false);
    }
  }

  async function handlePortal() {
    setLoading(true);
    try {
      const { portal_url } = await createPortal(returnPath);
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
        ? "Access full filing archive"
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
            <span className="text-brand-600">✓</span> Full filing period archive
          </li>
          <li className="flex items-center gap-2">
            <span className="text-brand-600">✓</span> Full GAAP statement line items
          </li>
          <li className="flex items-center gap-2">
            <span className="text-brand-600">✓</span> Saved peer groups
          </li>
          <li className="flex items-center gap-2">
            <span className="text-brand-600">✓</span> Self-serve billing via Stripe
          </li>
        </ul>

        {!showCheckout ? (
          <div key={formKey}>
            <MagicLinkForm
              returnPath={returnPath}
              requireCorporateEmail
              submitLabel="Send magic link to continue"
              onComplete={() => {
                refresh().then(() => setShowCheckout(true));
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {auth?.email && (
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

export default function PaywallModal(props: PaywallModalProps) {
  if (!props.open) return null;
  return (
    <Suspense fallback={null}>
      <PaywallModalInner {...props} />
    </Suspense>
  );
}
