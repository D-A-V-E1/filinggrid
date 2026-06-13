export default function PrivacyStrip({ className = "" }: { className?: string }) {
  return (
    <p
      className={`text-xs leading-relaxed text-slate-500 ${className}`}
      role="note"
    >
      <span className="mr-1" aria-hidden="true">🔒</span>
      <strong className="font-medium text-slate-600">Stateless filing execution</strong>
      {" — "}
      SEC documents are streamed and parsed in volatile memory (RAM) and permanently
      destroyed upon session termination. Filing content is never cached, logged, or
      used for AI training. We store only account and billing metadata.
    </p>
  );
}
