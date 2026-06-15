import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How FilingGrid collects, uses, and stores your information.",
};

const LAST_UPDATED = "June 15, 2026";

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <header className="mb-10 border-b border-slate-200 pb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">Legal</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: {LAST_UPDATED}</p>
      </header>

      <div className="prose prose-slate max-w-none prose-headings:font-sans prose-p:text-sm prose-p:leading-relaxed prose-li:text-sm">
        <p>
          FilingGrid (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) provides a web application for comparing
          U.S. SEC filings. This Privacy Policy explains what information we collect, how we use it,
          and what choices you have.
        </p>

        <h2>1. Information we collect</h2>
        <h3>Account and billing information</h3>
        <p>
          If you create an account or subscribe to a paid plan, we collect information needed to
          authenticate you and manage billing, such as:
        </p>
        <ul>
          <li>Email address (corporate email required for Professional plans)</li>
          <li>Organization and subscription tier</li>
          <li>Stripe customer and subscription identifiers</li>
          <li>Saved peer group names and ticker lists you choose to store</li>
        </ul>
        <p>
          Authentication is handled through Supabase. Payment processing is handled by Stripe. We do
          not store full payment card numbers on our servers.
        </p>

        <h3>SEC filing content</h3>
        <p>
          FilingGrid retrieves public SEC filings from EDGAR. To improve performance, we cache
          filing HTML and parsed sections on our servers after the first request so they do not need
          to be re-downloaded from EDGAR every time. This cached content is derived from publicly
          available SEC data.
        </p>
        <p>
          <strong>Filing content is not stored in your account database.</strong> We do not use
          filing text for advertising, resale, or AI model training.
        </p>

        <h3>Browser and technical data</h3>
        <p>
          During your session, the application may store lightweight comparison metadata (such as
          ticker lists and section identifiers) in your browser&apos;s session storage to speed up
          navigation. Standard web server and application logs may include IP address, browser type,
          and request timestamps for security and reliability.
        </p>

        <h2>2. How we use information</h2>
        <p>We use collected information to:</p>
        <ul>
          <li>Provide and operate the comparison workspace</li>
          <li>Authenticate users and enforce subscription limits</li>
          <li>Process payments and manage subscriptions</li>
          <li>Improve performance, reliability, and security</li>
          <li>Respond to support requests and legal obligations</li>
        </ul>

        <h2>3. What we do not do</h2>
        <ul>
          <li>We do not sell your personal information.</li>
          <li>We do not use filing content to train machine learning models.</li>
          <li>We do not store parsed filing HTML in your account database record.</li>
        </ul>

        <h2>4. Sharing with service providers</h2>
        <p>
          We use trusted third-party providers to operate the service, including hosting,
          authentication (Supabase), and payments (Stripe). These providers process data on our
          behalf according to their own privacy policies and our agreements with them.
        </p>

        <h2>5. Data retention</h2>
        <p>
          Account and billing records are retained while your account is active and as needed for
          legal, tax, and audit purposes. Server-side filing caches may be retained to improve
          performance for all users accessing the same public filings. Session storage data is cleared
          when you close your browser tab.
        </p>

        <h2>6. Security</h2>
        <p>
          We use industry-standard measures to protect account and billing data, including encrypted
          connections (HTTPS) and access controls. No method of transmission or storage is completely
          secure, and we cannot guarantee absolute security.
        </p>

        <h2>7. Your choices</h2>
        <ul>
          <li>You may use the free tier without creating an account.</li>
          <li>You may sign out at any time from the application header.</li>
          <li>
            Professional subscribers may manage or cancel billing through the Stripe Customer Portal.
          </li>
          <li>
            To request access, correction, or deletion of account data, contact us using the
            information below.
          </li>
        </ul>

        <h2>8. Children</h2>
        <p>
          FilingGrid is intended for business and professional use. We do not knowingly collect
          information from children under 16.
        </p>

        <h2>9. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will revise the &quot;Last
          updated&quot; date at the top of this page when changes are posted.
        </p>

        <h2>10. Contact</h2>
        <p>
          Questions about this Privacy Policy may be directed to{" "}
          <a href="mailto:privacy@filinggrid.com">privacy@filinggrid.com</a>.
        </p>
      </div>

      <footer className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">
        See also:{" "}
        <Link href="/terms" className="text-brand-700 hover:underline">
          Terms of Service
        </Link>
      </footer>
    </article>
  );
}
