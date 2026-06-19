import TickerSearchBar from "@/components/TickerSearchBar";
import Link from "next/link";

const FEATURES = [
  {
    title: "Side-by-side columns",
    description:
      "Compare up to 3 peers free (8 on Professional) with synchronized section navigation.",
  },
  {
    title: "Smart local caching",
    description:
      "Public SEC filings are cached on the server after first fetch so repeat views load faster — without re-downloading from EDGAR each time.",
  },
  {
    title: "Institutional typography",
    description: "Serif filing body, mono tabular figures, compact density for data-heavy review.",
  },
];

const POPULAR = [
  { slug: "aapl-vs-msft", label: "Apple vs Microsoft" },
  { slug: "nvda-vs-amd-vs-intc", label: "NVDA vs AMD vs Intel" },
  { slug: "jpm-vs-gs-vs-ms", label: "JPM vs Goldman vs Morgan Stanley" },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-screen-xl px-4 py-20 text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-brand-600">
            SEC Disclosure Workspace
          </p>
          <h1 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Review multiple SEC filings
            <span className="block text-slate-400">fast, side by side</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-600">
            Stream 10-K and 10-Q disclosures from EDGAR into standard sections across
            synchronized columns — jump between peers in one workspace without losing your
            place, and revisit comparisons without re-downloading from EDGAR. Only account
            and billing data are stored in our database.
          </p>
          <div className="mx-auto mt-10">
            <TickerSearchBar />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-screen-xl px-4 py-16">
        <div className="grid gap-8 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-sm font-semibold text-slate-900">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Popular comparisons */}
      <section className="border-t border-slate-200 bg-slate-50 py-12">
        <div className="mx-auto max-w-screen-xl px-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
            Popular comparisons
          </h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {POPULAR.map((p) => (
              <Link
                key={p.slug}
                href={`/compare/${p.slug}`}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-brand-500 hover:text-brand-700"
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
