import type { Metadata } from "next";

export const SITE_NAME = "Peer Disclosures";
export const SITE_TAGLINE = "SEC Filing Comparison Workspace";
export const SUPPORT_EMAIL = "support@peerdisclosures.com";

export const DEFAULT_DESCRIPTION =
  "Compare SEC 10-K, 10-Q, 20-F, and 6-K filings side by side with synchronized sections and XBRL financials. Free for current-year peer review; Professional adds history, full GAAP statements, and saved peer groups.";

export const DEFAULT_KEYWORDS = [
  "SEC filing",
  "10-K comparison",
  "XBRL financials",
  "footnote analysis",
  "MD&A",
  "peer comparison",
  "20-F",
  "ADR filers",
  "equity research",
  "disclosure analysis",
];

/** Popular compare presets surfaced on home and in sitemap. */
export {
  POPULAR_COMPARISONS,
  POPULAR_COMPARE_SLUGS,
  POPULAR_PEER_SECTIONS,
  FEATURED_POPULAR_COMPARISONS,
} from "@/lib/popular-comparisons";

export function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return url.replace(/\/$/, "");
}

export function absoluteUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteUrl()}${normalized}`;
}

export function siteMetadataBase(): URL {
  return new URL(`${getSiteUrl()}/`);
}

/** Shared Open Graph + Twitter defaults; page-level metadata merges on top. */
export function sharedSocialMetadata({
  title,
  description,
  path = "/",
  imagePath = "/og-default.svg",
}: {
  title: string;
  description: string;
  path?: string;
  imagePath?: string;
}): Pick<Metadata, "openGraph" | "twitter" | "alternates"> {
  const image = {
    url: imagePath,
    width: 1200,
    height: 630,
    alt: title,
  };

  return {
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "en_US",
      url: path,
      siteName: SITE_NAME,
      title,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imagePath],
    },
  };
}

export function organizationJsonLd() {
  return {
    "@type": "Organization",
    name: SITE_NAME,
    url: getSiteUrl(),
    email: SUPPORT_EMAIL,
    description: DEFAULT_DESCRIPTION,
  };
}

export function webApplicationJsonLd(overrides?: {
  name?: string;
  description?: string;
  url?: string;
}) {
  return {
    "@type": "WebApplication",
    name: overrides?.name ?? SITE_NAME,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    description: overrides?.description ?? DEFAULT_DESCRIPTION,
    url: overrides?.url ?? getSiteUrl(),
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "USD",
      },
      {
        "@type": "Offer",
        name: "Professional",
        price: "29",
        priceCurrency: "USD",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "29",
          priceCurrency: "USD",
          billingDuration: "P1M",
        },
      },
    ],
  };
}

export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [organizationJsonLd(), webApplicationJsonLd()],
  };
}

export function compareJsonLd(peerSlug: string, tickers: string[]) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationJsonLd(),
      webApplicationJsonLd({
        description: `SEC filing comparison for ${tickers.join(", ")}`,
        url: absoluteUrl(`/compare/${peerSlug}`),
      }),
      {
        "@type": "WebPage",
        name: `${tickers.join(" vs ")} SEC Filing Comparison`,
        url: absoluteUrl(`/compare/${peerSlug}`),
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: getSiteUrl() },
      },
    ],
  };
}
