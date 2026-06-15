import { Suspense } from "react";
import PricingPlans from "@/components/pricing/PricingPlans";

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-screen-lg px-4 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-slate-900">Simple, transparent pricing</h1>
        <p className="mt-3 text-slate-600">
          Free for quick comparisons. Professional unlocks when you need more columns or history.
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
