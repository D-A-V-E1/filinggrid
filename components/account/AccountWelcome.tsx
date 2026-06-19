"use client";

import Link from "next/link";

interface AccountWelcomeProps {
  isPro: boolean;
  onDismiss: () => void;
}

export default function AccountWelcome({ isPro, onDismiss }: AccountWelcomeProps) {
  if (isPro) {
    return (
      <section className="rounded-xl border border-brand-200 bg-brand-50 p-6">
        <h2 className="text-lg font-semibold text-brand-900">Professional is active</h2>
        <p className="mt-2 text-sm text-brand-800">
          Your subscription is live. Here is how to get the most out of FilingGrid:
        </p>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-brand-900">
          <li>
            Open an{" "}
            <Link
              href="/compare/aapl-vs-msft-vs-nvda-vs-googl"
              className="font-medium text-brand-700 underline-offset-2 hover:underline"
            >
              8-ticker compare workspace
            </Link>{" "}
            to use all columns at once.
          </li>
          <li>
            Save peer groups from the compare toolbar so you can reload your favorite sets
            quickly.
          </li>
          <li>
            Expand GAAP statement sections in the compare view for full line-item detail across
            tickers.
          </li>
        </ol>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-5 rounded-lg border border-brand-300 bg-white px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-100"
        >
          Got it
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-brand-200 bg-brand-50 p-6">
      <h2 className="text-lg font-semibold text-brand-900">Welcome to FilingGrid</h2>
      <p className="mt-2 text-sm text-brand-800">
        You are signed in on the free plan. Here are three quick steps to get started:
      </p>
      <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-brand-900">
        <li>
          Try the{" "}
          <Link
            href="/compare/aapl-vs-msft"
            className="font-medium text-brand-700 underline-offset-2 hover:underline"
          >
            compare workspace
          </Link>{" "}
          with two tickers side by side.
        </li>
        <li>
          Use the period picker in compare to switch between the latest filing and the last
          completed fiscal year.
        </li>
        <li>
          Upgrade to Professional with a <strong>work email</strong> for 8 columns, saved peer
          groups, and full GAAP statements.
        </li>
      </ol>
      <p className="mt-4 text-xs text-brand-700">
        You may receive emails from Supabase (sign-in links) or Stripe (receipts and billing
        updates). Check spam if you do not see them.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-5 rounded-lg border border-brand-300 bg-white px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-100"
      >
        Got it
      </button>
    </section>
  );
}
