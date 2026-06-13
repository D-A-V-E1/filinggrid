import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
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
    "Stateless, side-by-side SEC 10-K and 10-Q disclosure comparison for institutional analysts. Compare footnotes, MD&A, and financial notes across peer companies.",
  keywords: ["SEC filing", "10-K comparison", "footnote analysis", "MD&A", "peer comparison"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable} ${ibmPlexMono.variable}`}>
      <body className="font-sans">
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold tracking-tight text-slate-900">
                Filing<span className="text-brand-600">Grid</span>
              </span>
            </Link>
            <nav className="flex items-center gap-6 text-sm">
              <Link href="/pricing" className="text-slate-600 hover:text-slate-900">
                Pricing
              </Link>
              <Link
                href="/compare/aapl-vs-msft"
                className="rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700"
              >
                Try demo
              </Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="border-t border-slate-200 bg-white py-8">
          <div className="mx-auto max-w-screen-2xl px-4 text-center text-xs text-slate-400">
            <p>FilingGrid is not affiliated with the U.S. Securities and Exchange Commission.</p>
            <p className="mt-1">
              SEC filings are public domain. Parsed in volatile memory only — never stored.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
