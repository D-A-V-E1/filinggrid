import CompareGrid from "@/components/compare/CompareGrid";
import { parsePeerSlug } from "@/lib/utils";

interface Props {
  params: Promise<{ peer_slug: string }>;
  searchParams: Promise<{ year?: string }>;
}

export default async function ComparePage({ params, searchParams }: Props) {
  const { peer_slug } = await params;
  const { year } = await searchParams;
  const tickers = parsePeerSlug(peer_slug);
  const fiscalYear = year ? parseInt(year, 10) : undefined;

  return <CompareGrid tickers={tickers} fiscalYear={fiscalYear} />;
}
