"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { prewarmApi } from "@/lib/api-warmup";
import { POPULAR_PEER_SECTIONS } from "@/lib/popular-comparisons";

export default function PopularCompareLinks() {
  const router = useRouter();

  function handleWarmNavigate(href: string) {
    prewarmApi();
    router.prefetch(href);
  }

  return (
    <div className="mt-6 space-y-8">
      {POPULAR_PEER_SECTIONS.map((section) => (
        <div key={section.id}>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {section.label}
          </h3>
          <div className="mt-3 flex flex-wrap gap-3">
            {section.groups.map((group) => {
              const href = `/compare/${group.slug}`;
              return (
                <Link
                  key={group.id}
                  href={href}
                  onMouseEnter={() => handleWarmNavigate(href)}
                  onFocus={() => handleWarmNavigate(href)}
                  onTouchStart={() => prewarmApi()}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-brand-500 hover:text-brand-700"
                >
                  {group.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
