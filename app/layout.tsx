import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import { Inter, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import ChunkErrorRecovery from "@/components/ChunkErrorRecovery";
import HeaderNav from "@/components/HeaderNav";
import QueryStatusBanner from "@/components/QueryStatusBanner";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_KEYWORDS,
  SITE_NAME,
  SITE_TAGLINE,
  sharedSocialMetadata,
  siteMetadataBase,
} from "@/lib/seo";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

const defaultTitle = `${SITE_NAME} — ${SITE_TAGLINE}`;

export const metadata: Metadata = {
  metadataBase: siteMetadataBase(),
  title: {
    default: defaultTitle,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: DEFAULT_KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: siteMetadataBase() }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: { email: false, address: false, telephone: false },
  robots: { index: true, follow: true },
  ...sharedSocialMetadata({
    title: defaultTitle,
    description: DEFAULT_DESCRIPTION,
    path: "/",
  }),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable} ${ibmPlexMono.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <ChunkErrorRecovery />
        <header className="sticky top-0 z-50 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex min-h-14 max-w-screen-2xl items-center justify-between gap-2 px-4 py-2 sm:gap-3">
            <Link href="/" className="relative z-10 flex shrink-0 items-center gap-2">
              <span className="font-mono text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                Peer<span className="text-brand-600">Disclosures</span>
              </span>
            </Link>
            <div className="min-w-0 flex-1">
              <Suspense fallback={<div className="h-8 w-32" />}>
                <HeaderNav />
              </Suspense>
            </div>
          </div>
          <Suspense fallback={null}>
            <QueryStatusBanner />
          </Suspense>
        </header>
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        <footer className="shrink-0 border-t border-slate-200 bg-white py-3">
          <div className="mx-auto max-w-screen-2xl px-4 text-center text-xs leading-snug text-slate-400">
            <p className="text-slate-500">
              © {new Date().getFullYear()} Peer Disclosures
            </p>
            <p className="mt-1.5" role="note">
              <span className="mr-1" aria-hidden="true">
                🔒
              </span>
              <strong className="font-medium text-slate-500">Public SEC data</strong>
              {" — "}
              Not affiliated with the SEC. Filings are cached locally for performance, not stored in
              your account.
            </p>
            <p className="mt-1" role="note">
              <span className="mr-1" aria-hidden="true">
                ⚠️
              </span>
              <strong className="font-medium text-slate-500">Research use only</strong>
              {" — "}
              Not investment advice. Parsed data may be wrong or outdated; verify against original
              filings.
            </p>
            <nav className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-slate-500">
              <a href="mailto:support@peerdisclosures.com" className="hover:text-slate-700">
                support@peerdisclosures.com
              </a>
              <span aria-hidden="true">·</span>
              <Link href="/privacy" className="hover:text-slate-700">
                Privacy Policy
              </Link>
              <span aria-hidden="true">·</span>
              <Link href="/terms" className="hover:text-slate-700">
                Terms of Service
              </Link>
            </nav>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
