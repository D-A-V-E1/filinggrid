"use client";

import { useState } from "react";
import Link from "next/link";
import PaywallModal from "@/components/billing/PaywallModal";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "For quick peer checks and current-year filings.",
    features: [
      "Up to 3 ticker columns",
      "Current year 10-K / 10-Q only",
      "Synchronized section navigation",
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
      "Historical filings (prior years)",
      "Saved peer groups",
      "Stripe Customer Portal (self-serve billing)",
      "Corporate email required",
    ],
    cta: "Upgrade to Professional",
    href: "/compare/aapl-vs-msft-vs-nvda-vs-googl",
    highlighted: true,
    isPro: true,
  },
];

export default function PricingPlans() {
  const [paywallOpen, setPaywallOpen] = useState(false);

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
              <button
                type="button"
                onClick={() => setPaywallOpen(true)}
                className="mt-8 block w-full rounded-lg bg-brand-600 py-2.5 text-center text-sm font-medium text-white transition hover:bg-brand-700"
              >
                {plan.cta}
              </button>
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

      <PaywallModal
        open={paywallOpen}
        reason="subscription_required"
        message="Unlock up to 8 columns, historical filings, and saved peer groups."
        onClose={() => setPaywallOpen(false)}
      />
    </>
  );
}
