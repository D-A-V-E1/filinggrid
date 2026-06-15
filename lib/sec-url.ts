const ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data";

export function buildFilingUrl(
  cik: string,
  accessionNoDash: string,
  primaryDocument?: string | null
): string {
  const cikInt = String(parseInt(cik, 10));
  const primary = primaryDocument || `${accessionNoDash}.htm`;
  return `${ARCHIVES_BASE}/${cikInt}/${accessionNoDash}/${primary}`;
}

export function accessionFromCacheKey(cacheKey: string): string | null {
  const parts = cacheKey.split(":");
  return parts.length >= 3 ? parts[2] : null;
}

export interface FilingUrlSource {
  cik: string;
  cache_key?: string | null;
  filing_url?: string | null;
  primary_document?: string | null;
}

export function resolveFilingUrl(source: FilingUrlSource): string | null {
  if (source.filing_url) return source.filing_url;
  if (!source.cik || !source.cache_key) return null;
  const accession = accessionFromCacheKey(source.cache_key);
  if (!accession) return null;
  return buildFilingUrl(source.cik, accession, source.primary_document);
}
