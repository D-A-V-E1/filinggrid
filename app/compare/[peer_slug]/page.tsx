import CompareGrid from "@/components/compare/CompareGrid";
import { parsePeerSlug, validateCompareTickers } from "@/lib/utils";

interface Props {
  params: Promise<{ peer_slug: string }>;
  searchParams: Promise<{ year?: string; period?: string }>;
}

export default async function ComparePage({ params, searchParams }: Props) {
  const { peer_slug } = await params;
  const { year, period } = await searchParams;
  const tickers = parsePeerSlug(peer_slug);
  const fiscalYear = year ? parseInt(year, 10) : undefined;
  const slugError = validateCompareTickers(tickers);

  return (
    <CompareGrid
      tickers={tickers}
      fiscalYear={fiscalYear}
      period={period}
      slugError={slugError}
    />
  );
}
