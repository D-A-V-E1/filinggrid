import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-3 text-sm text-slate-600">
        That compare URL may be invalid, or the page was moved.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/"
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Home
        </Link>
        <Link
          href="/compare/aapl-vs-msft"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Try demo
        </Link>
      </div>
    </div>
  );
}
