import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms and conditions for using FilingGrid.",
};

const LAST_UPDATED = "June 15, 2026";

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <header className="mb-10 border-b border-slate-200 pb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">Legal</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: {LAST_UPDATED}</p>
      </header>

      <div className="prose prose-slate max-w-none prose-headings:font-sans prose-p:text-sm prose-p:leading-relaxed prose-li:text-sm">
        <p>
          These Terms of Service (&quot;Terms&quot;) govern your access to and use of the FilingGrid
          website and application (the &quot;Service&quot;). By using the Service, you agree to these
          Terms.
        </p>

        <h2>1. The Service</h2>
        <p>
          FilingGrid provides tools to retrieve, parse, and display publicly available U.S. Securities
          and Exchange Commission (SEC) filings for side-by-side comparison. FilingGrid is not
          affiliated with, endorsed by, or sponsored by the SEC or any listed company.
        </p>

        <h2>2. Eligibility</h2>
        <p>
          You must be at least 18 years old and able to form a binding contract to use the Service.
          Professional plans require a valid corporate email address. You are responsible for
          maintaining the confidentiality of your account credentials.
        </p>

        <h2>3. Subscriptions and billing</h2>
        <p>
          Paid features are offered on a subscription basis through Stripe. By subscribing, you
          authorize recurring charges according to the plan selected at checkout. Fees are billed in
          advance and are non-refundable except where required by law. You may cancel or manage your
          subscription through the Stripe Customer Portal.
        </p>
        <p>
          We may change pricing with reasonable notice. Continued use after a price change constitutes
          acceptance of the new pricing for subsequent billing periods.
        </p>

        <h2>4. Free and Professional tiers</h2>
        <p>Feature limits (such as column count, filing period archive, full GAAP statement tables, and saved peer groups) depend on your subscription tier. We may modify tier limits or features with notice, but will not reduce paid features during an active billing period without consent or a pro-rata remedy where required by law.</p>

        <h2>5. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any unlawful purpose</li>
          <li>Attempt to circumvent access controls, rate limits, or paywalls</li>
          <li>Scrape, bulk-download, or redistribute the Service in a way that burdens our infrastructure or violates SEC fair-access guidelines</li>
          <li>Reverse engineer or interfere with the security or operation of the Service</li>
          <li>Misrepresent your identity or affiliation</li>
        </ul>

        <h2>6. SEC data and accuracy</h2>
        <p>
          Filing content is sourced from SEC EDGAR and other public records. We do not guarantee
          completeness, accuracy, timeliness, or correct section parsing. The Service is a research
          aid only. You are solely responsible for verifying information before making business or
          investment decisions.
        </p>

        <h2>7. No investment advice</h2>
        <p>
          FilingGrid does not provide investment, legal, accounting, or tax advice. Nothing in the
          Service constitutes a recommendation to buy, sell, or hold any security.
        </p>

        <h2>8. Intellectual property</h2>
        <p>
          SEC filings are public records. FilingGrid&apos;s software, branding, design, and
          documentation are owned by us or our licensors. You receive a limited, non-exclusive,
          non-transferable license to use the Service for your internal business purposes during your
          subscription or free-tier access.
        </p>

        <h2>9. Privacy</h2>
        <p>
          Our collection and use of personal information is described in our{" "}
          <Link href="/privacy">Privacy Policy</Link>, which is incorporated into these Terms by
          reference.
        </p>

        <h2>10. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF
          ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
        </p>

        <h2>11. Limitation of liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, FILINGGRID AND ITS AFFILIATES WILL NOT BE LIABLE
          FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF
          PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR
          ANY CLAIM RELATING TO THE SERVICE WILL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE (12)
          MONTHS BEFORE THE CLAIM AROSE, OR ONE HUNDRED U.S. DOLLARS ($100), WHICHEVER IS GREATER.
        </p>

        <h2>12. Termination</h2>
        <p>
          You may stop using the Service at any time. We may suspend or terminate access if you
          violate these Terms or if we discontinue the Service. Upon termination, provisions that by
          their nature should survive (including disclaimers and limitations of liability) will
          remain in effect.
        </p>

        <h2>13. Governing law</h2>
        <p>
          These Terms are governed by the laws of the State of Delaware, United States, without
          regard to conflict-of-law principles. Disputes will be resolved in the state or federal
          courts located in Delaware, unless applicable law requires otherwise.
        </p>

        <h2>14. Changes</h2>
        <p>
          We may update these Terms from time to time. Material changes will be indicated by updating
          the &quot;Last updated&quot; date. Continued use after changes become effective constitutes
          acceptance of the revised Terms.
        </p>

        <h2>15. Contact</h2>
        <p>
          Questions about these Terms may be directed to{" "}
          <a href="mailto:legal@filinggrid.com">legal@filinggrid.com</a>.
        </p>
      </div>

      <footer className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">
        See also:{" "}
        <Link href="/privacy" className="text-brand-700 hover:underline">
          Privacy Policy
        </Link>
      </footer>
    </article>
  );
}
