"use client";

export default function PrivacyStrip({ className = "" }: { className?: string }) {
  return (
    <p
      className={`text-xs leading-relaxed text-slate-500 ${className}`}
      role="note"
    >
      <span className="mr-1" aria-hidden="true">🔒</span>
      <strong className="font-medium text-slate-600">Performance caching, private by design</strong>
      {" — "}
      Public SEC filings are cached locally after the first fetch so repeat comparisons
      load faster without re-downloading from EDGAR. Filing content is never stored in
      your account database, logged, or used for AI training. We persist only account and
      billing metadata.
    </p>
  );
}
