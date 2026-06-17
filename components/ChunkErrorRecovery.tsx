"use client";

import { useEffect } from "react";

/** Reload once when a stale dev/prod chunk fails to parse (common after HMR or deploy). */
export default function ChunkErrorRecovery() {
  useEffect(() => {
    const key = "fg:chunk-reload";

    function shouldReload(reason: unknown): boolean {
      const text = String(reason ?? "");
      return (
        text.includes("ChunkLoadError") ||
        text.includes("Loading chunk") ||
        text.includes("Failed to fetch dynamically imported module") ||
        text.includes("Unexpected token") ||
        text.includes("reading 'call'") ||
        text.includes("options.factory")
      );
    }

    function reloadOnce() {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      window.location.reload();
    }

    function onRejection(event: PromiseRejectionEvent) {
      if (shouldReload(event.reason)) reloadOnce();
    }

    function onError(event: ErrorEvent) {
      if (shouldReload(event.message)) reloadOnce();
    }

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
