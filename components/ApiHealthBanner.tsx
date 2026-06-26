"use client";

import { apiUnreachableHint, isLocalDevHost } from "@/lib/api-environment";

interface ApiHealthBannerProps {
  healthy: boolean | null;
  /** True while cold-start retries are still in progress. */
  warming?: boolean;
}

export default function ApiHealthBanner({ healthy, warming }: ApiHealthBannerProps) {
  if (warming) {
    return (
      <div
        className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-center text-xs text-slate-600"
        role="status"
        aria-live="polite"
      >
        Waking up API… this can take up to a minute after idle time.
      </div>
    );
  }

  if (healthy !== false) return null;

  return (
    <div
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900"
      role="alert"
    >
      {isLocalDevHost() ? (
        <>
          API unreachable — start the backend on port 8000 (
          <code className="font-mono">start.bat</code> or <code className="font-mono">run-api.bat</code>
          ), then refresh.
        </>
      ) : (
        <>API temporarily unreachable — {apiUnreachableHint()}</>
      )}
    </div>
  );
}
