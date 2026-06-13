import Link from "next/link";

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
    cta: "Upgrade via compare workspace",
    href: "/compare/aapl-vs-msft-vs-nvda-vs-googl",
    highlighted: true,
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-screen-lg px-4 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-slate-900">Simple, transparent pricing</h1>
        <p className="mt-3 text-slate-600">
          Free for quick comparisons. Professional unlocks when you need more columns or history.
        </p>
      </div>

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
            <Link
              href={plan.href}
              className={`mt-8 block rounded-lg py-2.5 text-center text-sm font-medium transition ${
                plan.highlighted
                  ? "bg-brand-600 text-white hover:bg-brand-700"
                  : "border border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-slate-400">
        Subscriptions managed via Stripe Customer Portal. Cancel anytime.
      </p>
    </div>
  );
}
