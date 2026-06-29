import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CompareDeltaReport from "@/components/compare/CompareDeltaReport";
import { canonicalComparePath, isCanonicalPeerSlug, parsePeerSlug, validateCompareTickers } from "@/lib/utils";

interface Props {
  params: Promise<{ peer_slug: string }>;
  searchParams: Promise<{ year?: string; period?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { peer_slug } = await params;
  const tickers = parsePeerSlug(peer_slug);
  const tickerStr = tickers.join(" vs ");

  return {
    title: `${tickerStr} — Section delta report`,
    description: `Section-level disclosure delta map for ${tickers.join(", ")}.`,
    robots: { index: false, follow: false },
  };
}

export default async function DeltaReportPage({ params, searchParams }: Props) {
  const { peer_slug } = await params;
  const { year, period } = await searchParams;
  if (!isCanonicalPeerSlug(peer_slug)) {
    redirect(`${canonicalComparePath(peer_slug, year, period)}/deltas`);
  }
  const tickers = parsePeerSlug(peer_slug);
  const fiscalYear = year ? parseInt(year, 10) : undefined;
  const slugError = validateCompareTickers(tickers);

  return (
    <CompareDeltaReport
      peerSlug={peer_slug}
      tickers={tickers}
      fiscalYear={fiscalYear}
      period={period}
      slugError={slugError}
    />
  );
}
