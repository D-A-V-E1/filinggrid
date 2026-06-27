"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { prewarmApi } from "@/lib/api-warmup";
import { POPULAR_COMPARISONS } from "@/lib/seo";

export default function PopularCompareLinks() {
  const router = useRouter();

  function handleWarmNavigate(href: string) {
    prewarmApi();
    router.prefetch(href);
  }

  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {POPULAR_COMPARISONS.slice(0, 4).map((p) => {
        const href = `/compare/${p.slug}`;
        return (
          <Link
            key={p.slug}
            href={href}
            onMouseEnter={() => handleWarmNavigate(href)}
            onFocus={() => handleWarmNavigate(href)}
            onTouchStart={() => prewarmApi()}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-brand-500 hover:text-brand-700"
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}
