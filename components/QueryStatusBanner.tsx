"use client";

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

  useEffect(() => {
    if (searchParams.get("checkout") !== "success") {
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
  }, [searchParams, refresh]);

  const banner = useMemo((): BannerConfig | null => {
    if (searchParams.get("auth") === "error") {
      return {
        variant: "error",
        message: "Sign-in failed. Check your link or try again.",
        paramKey: "auth",
        paramValue: "error",
      };
    }
    if (searchParams.get("auth") === "success") {
      return {
        variant: "success",
        message: "Signed in successfully.",
        paramKey: "auth",
        paramValue: "success",
      };
    }
    if (searchParams.get("checkout") === "success") {
      return {
        variant: "success",
        message: checkoutPending
          ? "Payment received — activating Professional…"
          : "Subscription active — Professional features are now unlocked.",
        paramKey: "checkout",
        paramValue: "success",
      };
    }
    if (searchParams.get("checkout") === "cancelled") {
      return {
        variant: "info",
        message: "Checkout was cancelled. You can upgrade anytime from the compare workspace.",
        paramKey: "checkout",
        paramValue: "cancelled",
      };
    }
    return null;
  }, [searchParams, checkoutPending]);

  const dismiss = useCallback(() => {
    if (!banner) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete(banner.paramKey);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [banner, pathname, router, searchParams]);

  if (!banner) return null;

  return (
    <div
      className={`border-b px-4 py-3 text-center text-sm ${VARIANT_STYLES[banner.variant]}`}
      role="status"
    >
      <div className="mx-auto flex max-w-screen-2xl items-center justify-center gap-4">
        <p>{banner.message}</p>
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
