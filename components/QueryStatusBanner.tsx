"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuthMe } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

type BannerVariant = "success" | "error" | "info";

interface BannerConfig {
  variant: BannerVariant;
  message: string;
  paramKey: string;
  paramValue: string;
  actionHref?: string;
  actionLabel?: string;
}

const VARIANT_STYLES: Record<BannerVariant, string> = {
  success: "border-brand-200 bg-brand-50 text-brand-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-slate-200 bg-slate-50 text-slate-800",
};

export default function QueryStatusBanner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { refresh } = useAuth();
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [dismissedBannerKey, setDismissedBannerKey] = useState<string | null>(null);
  const queryString = searchParams.toString();

  useEffect(() => {
    const params = new URLSearchParams(queryString);
    if (params.get("checkout") !== "success") {
      setCheckoutPending(false);
      return;
    }

    let cancelled = false;
    setCheckoutPending(true);

    (async () => {
      for (let attempt = 0; attempt < 15 && !cancelled; attempt++) {
        try {
          const me = await getAuthMe();
          if (me.tier === "professional") {
            await refresh();
            setCheckoutPending(false);
            return;
          }
        } catch {
          /* webhook may still be processing */
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (!cancelled) {
        setCheckoutPending(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryString, refresh]);

  useEffect(() => {
    setDismissedBannerKey(null);
  }, [queryString]);

  const banner = useMemo((): BannerConfig | null => {
    const params = new URLSearchParams(queryString);
    if (params.get("auth") === "error") {
      return {
        variant: "error",
        message: "Sign-in failed. Check your link or try again.",
        paramKey: "auth",
        paramValue: "error",
      };
    }
    if (params.get("auth") === "success") {
      return {
        variant: "success",
        message: "Signed in successfully.",
        paramKey: "auth",
        paramValue: "success",
      };
    }
    if (params.get("checkout") === "success") {
      return {
        variant: "success",
        message: checkoutPending
          ? "Payment received — activating Professional…"
          : "Subscription active — Professional features are now unlocked.",
        paramKey: "checkout",
        paramValue: "success",
        ...(!checkoutPending && {
          actionHref: "/compare/aapl-vs-msft-vs-nvda-vs-googl",
          actionLabel: "Open compare with 8 tickers",
        }),
      };
    }
    if (params.get("checkout") === "cancelled") {
      return {
        variant: "info",
        message: "Checkout was cancelled. You can upgrade anytime from the compare workspace.",
        paramKey: "checkout",
        paramValue: "cancelled",
      };
    }
    return null;
  }, [queryString, checkoutPending]);

  const bannerKey = banner ? `${banner.paramKey}=${banner.paramValue}` : null;

  const dismiss = useCallback(() => {
    if (!banner) return;
    setDismissedBannerKey(`${banner.paramKey}=${banner.paramValue}`);
    const params = new URLSearchParams(queryString);
    params.delete(banner.paramKey);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [banner, pathname, queryString, router]);

  if (!banner || dismissedBannerKey === bannerKey) return null;

  return (
    <div
      className={`border-b px-4 py-3 text-center text-sm ${VARIANT_STYLES[banner.variant]}`}
      role="status"
    >
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-center gap-4">
        <p>{banner.message}</p>
        {banner.actionHref && banner.actionLabel && (
          <Link
            href={banner.actionHref}
            className="shrink-0 font-medium underline-offset-2 hover:underline"
          >
            {banner.actionLabel}
          </Link>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 font-medium underline-offset-2 hover:underline"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
