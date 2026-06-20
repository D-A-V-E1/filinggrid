"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePeerGroups } from "@/hooks/usePeerGroups";
import { buildPeerSlug } from "@/lib/utils";

export default function SavedPeerGroupsCallout() {
  const router = useRouter();
  const { groups, loading, error, remove } = usePeerGroups();

  function openGroup(tickers: string[]) {
    router.push(`/compare/${buildPeerSlug(tickers)}`);
  }

  return (
    <section className="border-y border-slate-200 bg-slate-50 py-12">
      <div className="mx-auto max-w-screen-xl px-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
          Your workspace
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Saved peer groups</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600">
          Jump back to comparisons you have saved, or start a new one with the search bar above.
        </p>

        {loading && <p className="mt-6 text-sm text-slate-400">Loading saved groups…</p>}

        {!loading && groups.length === 0 && (
          <p className="mt-6 text-sm text-slate-500">
            No saved groups yet. Open a comparison and use{" "}
            <span className="font-medium text-slate-700">Saved groups</span> in the toolbar to
            store a peer set.
          </p>
        )}

        {!loading && groups.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <div
                key={group.id}
                className="group flex items-start justify-between rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-500"
              >
                <button
                  type="button"
                  onClick={() => openGroup(group.tickers_list)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="text-sm font-semibold text-slate-900 group-hover:text-brand-700">
                    {group.group_name}
                  </span>
                  <span className="mt-1 block font-mono text-xs text-slate-400">
                    {group.tickers_list.join(" · ")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Delete this saved group?")) {
                      void remove(group.id);
                    }
                  }}
                  className="ml-2 shrink-0 px-1 text-slate-400 hover:text-red-600"
                  aria-label={`Delete ${group.group_name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && groups.length > 0 && (
          <Link
            href="/compare/aapl-vs-msft"
            className="mt-6 inline-flex text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            Open compare view →
          </Link>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </section>
  );
}
