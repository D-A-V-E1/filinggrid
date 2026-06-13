import { MetadataRoute } from "next";

const POPULAR_SLUGS = [
  "aapl-vs-msft",
  "aapl-vs-msft-vs-nvda",
  "nvda-vs-amd-vs-intc",
  "jpm-vs-gs-vs-ms",
  "goog-vs-meta",
  "amzn-vs-shop",
  "tsla-vs-f",
  "ko-vs-pep",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    ...POPULAR_SLUGS.map((slug) => ({
      url: `${base}/compare/${slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
  ];
}
