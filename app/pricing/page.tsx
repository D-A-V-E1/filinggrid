import type { Metadata } from "next";
import { Suspense } from "react";
import PricingPlans from "@/components/pricing/PricingPlans";
import { SITE_NAME, sharedSocialMetadata } from "@/lib/seo";

const title = "Pricing";
const description =
  "Free SEC filing comparison for up to three tickers with section delta spotting. Professional at $29/month unlocks eight columns, full filing history, GAAP statements, and saved peer groups.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "SEC filing tool pricing",
    "equity research software",
    "10-K comparison subscription",
    "Peer Disclosures Professional",
  ],
  ...sharedSocialMetadata({ title: `${title} | ${SITE_NAME}`, description, path: "/pricing" }),
};

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-screen-lg px-4 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-slate-900">Simple, transparent pricing</h1>
        <p className="mt-3 text-slate-600">
          Free for quick comparisons with section delta spotting. Professional unlocks more columns, full statements, and complete filing history.
        </p>
      </div>

      <Suspense fallback={<div className="mt-12 h-64 animate-pulse rounded-2xl bg-slate-100" />}>
        <PricingPlans />
      </Suspense>

      <p className="mt-10 text-center text-xs text-slate-400">
        Subscriptions managed via Stripe Customer Portal. Cancel anytime.
      </p>
    </div>
  );
}
