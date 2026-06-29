import CompareGrid from "@/components/compare/CompareGrid";
import { canonicalComparePath, isCanonicalPeerSlug, parsePeerSlug, validateCompareTickers } from "@/lib/utils";
import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ peer_slug: string }>;
  searchParams: Promise<{ year?: string; period?: string }>;
}

export default async function ComparePage({ params, searchParams }: Props) {
  const { peer_slug } = await params;
  const { year, period } = await searchParams;
  if (!isCanonicalPeerSlug(peer_slug)) {
    redirect(canonicalComparePath(peer_slug, year, period));
  }
  const tickers = parsePeerSlug(peer_slug);
  const fiscalYear = year ? parseInt(year, 10) : undefined;
  const slugError = validateCompareTickers(tickers);

  return (
    <CompareGrid
      peerSlug={peer_slug}
      tickers={tickers}
      fiscalYear={fiscalYear}
      period={period}
      slugError={slugError}
    />
  );
}
