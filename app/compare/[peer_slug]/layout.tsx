import type { Metadata } from "next";
import { parsePeerSlug } from "@/lib/utils";

interface Props {
  params: Promise<{ peer_slug: string }>;
}

async function fetchSeoSummary(tickers: string[]) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  try {
    const res = await fetch(`${apiUrl}/tickers/search?q=${encodeURIComponent(tickers[0] || "")}&limit=8`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const results = (await res.json()) as { ticker: string; company_name: string }[];
    return {
      columns: tickers.map((ticker) => {
        const match = results.find((r) => r.ticker === ticker.toUpperCase());
        return { ticker: ticker.toUpperCase(), company_name: match?.company_name ?? ticker };
      }),
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { peer_slug } = await params;
  const tickers = parsePeerSlug(peer_slug);
  const tickerStr = tickers.join(" vs ");
  const year = new Date().getFullYear();

  const data = await fetchSeoSummary(tickers);
  const names = data?.columns?.map((c: { company_name: string }) => c.company_name) ?? tickers;

  const title = `${tickerStr} SEC Filing Comparison — ${year} 10-K Footnotes & MD&A`;
  const description = `Side-by-side SEC filing footnote and MD&A comparison between ${names.join(", ")}. Stateless, private ${year} 10-K and 10-Q disclosure workspace powered by FilingGrid.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
    alternates: {
      canonical: `/compare/${peer_slug}`,
    },
    keywords: [
      ...tickers.map((t) => `${t} 10-K`),
      ...tickers.map((t) => `${t} SEC filing`),
      "footnote comparison",
      "MD&A comparison",
      "peer group analysis",
    ],
  };
}

export default async function CompareLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ peer_slug: string }>;
}) {
  const { peer_slug } = await params;
  const tickers = parsePeerSlug(peer_slug);
  const data = await fetchSeoSummary(tickers);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "FilingGrid",
    applicationCategory: "FinanceApplication",
    description: `SEC filing comparison for ${tickers.join(", ")}`,
    url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/compare/${peer_slug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* SSR summary for crawlers — semantic HTML, no filing bodies */}
      <section className="sr-only" aria-hidden="true">
        <h1>
          SEC Filing Comparison: {tickers.join(" vs ")}
        </h1>
        {data?.columns?.map(
          (col: { ticker: string; company_name: string }) => (
            <article key={col.ticker}>
              <h2>
                {col.company_name} ({col.ticker})
              </h2>
            </article>
          )
        )}
      </section>
      {children}
    </>
  );
}
