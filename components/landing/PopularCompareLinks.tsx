"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { prewarmApi } from "@/lib/api-warmup";
import {
  FEATURED_POPULAR_COMPARISONS,
  POPULAR_PEER_SECTIONS,
  type PopularPeerGroup,
} from "@/lib/popular-comparisons";

const CHIP_CLASS =
  "inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 transition hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500";

function CompareChip({
  group,
  onWarm,
}: {
  group: Pick<PopularPeerGroup, "id" | "slug" | "label">;
  onWarm: (href: string) => void;
}) {
  const href = `/compare/${group.slug}`;

  return (
    <Link
      href={href}
      onMouseEnter={() => onWarm(href)}
      onFocus={() => onWarm(href)}
      onTouchStart={() => prewarmApi()}
      className={CHIP_CLASS}
    >
      {group.label}
    </Link>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
    >
      <path
        d="M3.5 5.25L7 8.75L10.5 5.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PopularCompareLinks() {
  const router = useRouter();

  function handleWarmNavigate(href: string) {
    prewarmApi();
    router.prefetch(href);
  }

  const sectionsWithMore = POPULAR_PEER_SECTIONS.map((section) => ({
    ...section,
    groups: section.groups.filter((group) => !group.featured),
  })).filter((section) => section.groups.length > 0);

  return (
    <div className="mt-4 space-y-4">
      {FEATURED_POPULAR_COMPARISONS.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Featured
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5 sm:grid sm:grid-cols-2 lg:grid-cols-3">
            {FEATURED_POPULAR_COMPARISONS.map((group) => (
              <CompareChip key={group.id} group={group} onWarm={handleWarmNavigate} />
            ))}
          </div>
        </div>
      )}

      {sectionsWithMore.length > 0 && (
        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {sectionsWithMore.map((section, index) => (
            <details key={section.id} className="group" open={index === 0}>
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">{section.label}</span>
                <span className="shrink-0 text-[10px] font-medium text-slate-400">
                  {section.groups.length}
                </span>
                <ChevronIcon className="shrink-0 text-slate-400 transition group-open:rotate-180" />
              </summary>
              <div className="border-t border-slate-100 px-3 pb-2.5 pt-1.5">
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
                  {section.groups.map((group) => (
                    <CompareChip key={group.id} group={group} onWarm={handleWarmNavigate} />
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
