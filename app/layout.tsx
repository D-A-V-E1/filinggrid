import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import ChunkErrorRecovery from "@/components/ChunkErrorRecovery";
import HeaderNav from "@/components/HeaderNav";
import QueryStatusBanner from "@/components/QueryStatusBanner";
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

export const metadata: Metadata = {
  title: {
    default: "FilingGrid — SEC Filing Comparison Workspace",
    template: "%s | FilingGrid",
  },
  description:
    "Compare SEC 10-K, 10-Q, 20-F, and 6-K filings side by side with synchronized sections and XBRL financials. Free for current-year peer review; Professional adds history, full GAAP statements, and saved peer groups.",
  keywords: [
    "SEC filing",
    "10-K comparison",
    "XBRL financials",
    "footnote analysis",
    "MD&A",
    "peer comparison",
    "20-F",
    "ADR filers",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable} ${ibmPlexMono.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <ChunkErrorRecovery />
        <header className="sticky top-0 z-50 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold tracking-tight text-slate-900">
                Filing<span className="text-brand-600">Grid</span>
              </span>
            </Link>
            <Suspense fallback={<div className="h-8 w-32" />}>
              <HeaderNav />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <QueryStatusBanner />
          </Suspense>
        </header>
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        <footer className="shrink-0 border-t border-slate-200 bg-white py-3">
          <div className="mx-auto max-w-screen-2xl px-4 text-center text-xs leading-snug text-slate-400">
            <p>
              FilingGrid is not affiliated with the U.S. Securities and Exchange Commission.
              <span className="hidden sm:inline"> · </span>
              <span className="mt-0.5 block sm:mt-0 sm:inline">
                SEC filings are public domain. Cached locally for performance — never stored in your
                account database.
              </span>
            </p>
            <nav className="mt-2 flex items-center justify-center gap-3 text-slate-500">
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
      </body>
    </html>
  );
}
