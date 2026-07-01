"use client";

import { useState } from "react";
import Link from "next/link";
import PaywallModal from "@/components/billing/PaywallModal";
import { createPortal, formatApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveTier } from "@/hooks/useEffectiveTier";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "For quick peer checks with headline metrics, recent filings, and delta spotting.",
    features: [
      "Up to 3 ticker columns",
      "Latest filing + last completed fiscal year (10-K / 10-Q / 20-F)",
      "Headline XBRL financial metrics",
      "Synchronized section navigation",
      "Section delta map and delta report (3 tickers)",
      "No login required",
    ],
    cta: "Start comparing",
    href: "/",
    highlighted: false,
    isPro: false,
  },
  {
    name: "Professional",
    price: "$29",
    period: "/ month",
    description: "For analysts who need depth, history, and saved peer groups.",
    features: [
      "Up to 8 ticker columns",
      "Full filing period archive",
      "Full GAAP statement line items",
      "Saved peer groups",
      "Stripe Customer Portal (self-serve billing)",
    ],
    cta: "Upgrade to Professional",
    href: "/compare/aapl-vs-msft-vs-nvda-vs-googl",
    highlighted: true,
    isPro: true,
  },
];

export default function PricingPlans() {
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState("");
  const { auth } = useAuth();
  const { isPro } = useEffectiveTier(auth);

  async function handleManageBilling() {
    setPortalLoading(true);
    setPortalError("");
    try {
      const { portal_url } = await createPortal("/pricing");
      window.location.href = portal_url;
    } catch (err) {
      setPortalError(formatApiError(err, "Billing portal unavailable. Please try again."));
      setPortalLoading(false);
    }
  }

  return (
    <>
      <div className="mt-12 grid gap-8 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-2xl border p-8 ${
              plan.highlighted
                ? "border-brand-500 bg-white shadow-lg ring-1 ring-brand-500"
                : "border-slate-200 bg-white"
            }`}
          >
            <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-bold text-slate-900">{plan.price}</span>
              <span className="text-sm text-slate-500">{plan.period}</span>
            </div>
            <p className="mt-3 text-sm text-slate-600">{plan.description}</p>
            <ul className="mt-6 space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                  <span className="mt-0.5 text-brand-600">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            {plan.isPro ? (
              isPro ? (
                <button
                  type="button"
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                  className="mt-8 block w-full rounded-lg border border-brand-200 bg-brand-50 py-2.5 text-center text-sm font-medium text-brand-800 transition hover:bg-brand-100 disabled:opacity-50"
                >
                  {portalLoading ? "Opening portal…" : "Current plan — manage billing"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPaywallOpen(true)}
                  className="mt-8 block w-full rounded-lg bg-brand-600 py-2.5 text-center text-sm font-medium text-white transition hover:bg-brand-700"
                >
                  {plan.cta}
                </button>
              )
            ) : (
              <Link
                href={plan.href}
                className="mt-8 block rounded-lg border border-slate-200 py-2.5 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {plan.cta}
              </Link>
            )}
          </div>
        ))}
      </div>

      {portalError && (
        <p className="mt-4 text-center text-sm text-red-600" role="alert">
          {portalError}
        </p>
      )}

      <PaywallModal
        open={paywallOpen}
        reason="subscription_required"
        message="Unlock up to 8 columns, full GAAP statements, complete filing history, and saved peer groups."
        onClose={() => setPaywallOpen(false)}
      />
    </>
  );
}
