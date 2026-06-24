import ProCallout from "@/components/landing/ProCallout";
import TickerSearchBar from "@/components/TickerSearchBar";
import Link from "next/link";

const FEATURES = [
  {
    title: "Synchronized section navigation",
    description:
      "Jump to Business, Risk Factors, MD&A, or footnotes — every column moves to the same disclosure at once.",
  },
  {
    title: "XBRL financials in context",
    description:
      "Headline revenue, income, and balance-sheet metrics load from SEC XBRL alongside the narrative. Professional adds full GAAP statements — Income, Balance Sheet, Cash Flow, and Equity.",
  },
  {
    title: "Domestic and ADR filers together",
    description:
      "Compare 10-K and 10-Q issuers with 20-F and 6-K filers in one grid. Periods align by fiscal quarter, not just form type.",
  },
  {
    title: "Streamed from EDGAR, cached for speed",
    description:
      "Filings parse into standard sections as columns load. Repeat views hit the server cache instead of re-fetching from EDGAR.",
  },
];

const POPULAR = [
  { slug: "aapl-vs-msft", label: "Apple vs Microsoft" },
  { slug: "nvda-vs-amd-vs-intc", label: "NVDA vs AMD vs Intel" },
  { slug: "jpm-vs-gs-vs-ms", label: "JPM vs Goldman vs Morgan Stanley" },
  { slug: "aapl-vs-nvda-vs-tsm", label: "Apple vs NVDA vs TSMC" },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-screen-xl px-4 py-20 text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-brand-600">
            SEC filing workspace
          </p>
          <h1 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Compare peer disclosures
            <span className="block text-slate-400">in one synchronized view</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600">
            PeerDisclosures pulls 10-K, 10-Q, 20-F, and 6-K filings from EDGAR, maps them to
            comparable sections, and lines up XBRL financials — so you can review MD&amp;A,
            risk factors, and footnotes side by side without juggling browser tabs.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500">
            Start free with three tickers and current-year filings. No login required.
          </p>
          <div className="mx-auto mt-10">
            <TickerSearchBar />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-screen-xl px-4 py-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-sm font-semibold text-slate-900">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <ProCallout />

      {/* Popular comparisons */}
      <section className="py-12">
        <div className="mx-auto max-w-screen-xl px-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
            Popular comparisons
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Jump in with a preset peer set, or search any tickers above.
          </p>
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
