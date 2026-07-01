"use client";

import Link from "next/link";
import SavedPeerGroupsCallout from "@/components/landing/SavedPeerGroupsCallout";
import { useAuth } from "@/hooks/useAuth";
import { hasRealProfessionalSubscription } from "@/lib/dev-tier";

const PRO_HIGHLIGHTS = [
  "Up to 8 ticker columns",
  "Section delta map across 8 columns",
  "Historical filing periods",
  "Full GAAP statement tables",
  "Saved peer groups",
];

/** Pro upsell on the landing page — hidden for paid Professional subscribers. */
export default function ProCallout() {
  const { auth, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (hasRealProfessionalSubscription(auth?.tier)) {
    return <SavedPeerGroupsCallout />;
  }

  return (
    <section className="border-y border-slate-200 bg-slate-50 py-12">
      <div className="mx-auto max-w-screen-xl px-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
          Professional
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          Go deeper when the compare gets serious
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-600">
          Unlock delta coverage across eight columns, historical filing periods, detailed GAAP
          statement tables, and saved peer groups — built for analysts who live in footnotes
          and financials.
        </p>
        <ul className="mx-auto mt-6 flex max-w-lg flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-700">
          {PRO_HIGHLIGHTS.map((item) => (
            <li key={item} className="flex items-center gap-1.5">
              <span className="text-brand-600" aria-hidden="true">
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
        <Link
          href="/pricing"
          className="mt-8 inline-flex items-center rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
        >
          View pricing — $29/mo
        </Link>
      </div>
    </section>
  );
}
