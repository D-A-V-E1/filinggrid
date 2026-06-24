import type { Metadata } from "next";
import { parsePeerSlug } from "@/lib/utils";

interface Props {
  params: Promise<{ peer_slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { peer_slug } = await params;
  const tickers = parsePeerSlug(peer_slug);
  const tickerStr = tickers.join(" vs ");
  const year = new Date().getFullYear();

  const title = `${tickerStr} SEC Filing Comparison — ${year} 10-K Footnotes & MD&A`;
  const description = `Side-by-side SEC filing footnote and MD&A comparison between ${tickers.join(", ")}. Fast, private ${year} 10-K and 10-Q disclosure workspace powered by PeerDisclosures.`;

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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "PeerDisclosures",
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
      <section className="sr-only" aria-hidden="true">
        <h1>SEC Filing Comparison: {tickers.join(" vs ")}</h1>
        {tickers.map((ticker) => (
          <article key={ticker}>
            <h2>{ticker}</h2>
          </article>
        ))}
      </section>
      {children}
    </>
  );
}
