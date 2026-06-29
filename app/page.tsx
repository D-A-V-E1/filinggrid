import ProCallout from "@/components/landing/ProCallout";
import PopularCompareLinks from "@/components/landing/PopularCompareLinks";
import TickerSearchBar from "@/components/TickerSearchBar";
import { homeJsonLd } from "@/lib/seo";

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

export default function HomePage() {
  const jsonLd = homeJsonLd();

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
            Peer Disclosures pulls 10-K, 10-Q, 20-F, and 6-K filings from EDGAR, maps them to
            comparable sections, and lines up XBRL financials — so you can review MD&amp;A,
            risk factors, and footnotes side by side without juggling browser tabs.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500">
            Start free with three tickers and current-year filings — no login, no credit card.
            Skip the EDGAR tab sprawl and Excel copy-paste.
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
      <section className="border-t border-slate-200 py-8">
        <div className="mx-auto max-w-screen-xl px-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Popular comparisons
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Jump in with a preset peer set, or search any tickers above.
          </p>
          <PopularCompareLinks />
        </div>
      </section>
    </div>
  );
}
