import { checkApiHealth } from "@/lib/api";

/** Backoff between API warmup probes (Render cold start can exceed 30s). */
export const WARMUP_BACKOFF_MS = [0, 2000, 5000, 10000, 20000, 30000];

/** Max delay between probes if all fail: 2+5+10+20+30 = 67s (6 attempts). */
export const WARMUP_MAX_ATTEMPTS = WARMUP_BACKOFF_MS.length;

/** Minimum interval between hover/focus prewarm probes. */
const PREWARM_MIN_INTERVAL_MS = 60_000;

let apiReadyCached = false;
let apiReadyPromise: Promise<boolean> | null = null;
let lastPrewarmAt = 0;

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise((r) => setTimeout(r, ms));
  }
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

export interface RetryWithBackoffOptions<T> {
  signal?: AbortSignal;
  location?: string;
  isSuccess?: (result: T) => boolean;
}

/** Retry `fn` with shared backoff until success or attempts exhausted. */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryWithBackoffOptions<T> = {}
): Promise<T | null> {
  const { signal, isSuccess = () => true } = options;

  for (let attempt = 0; attempt < WARMUP_BACKOFF_MS.length; attempt++) {
    if (signal?.aborted) return null;
    if (attempt > 0) {
      try {
        await delay(WARMUP_BACKOFF_MS[attempt] ?? 30000, signal);
      } catch {
        return null;
      }
    }

    try {
      const result = await fn();
      if (isSuccess(result)) {
        return result;
      }
    } catch {
      // retry with backoff
    }
  }

  return null;
}

function startApiReadyProbe(): Promise<boolean> {
  return retryWithBackoff(() => checkApiHealth(), {
    location: "lib/api-warmup.ts:waitForApiReady",
    isSuccess: (ok) => ok,
  }).then((result) => {
    const ok = result === true;
    if (ok) apiReadyCached = true;
    apiReadyPromise = null;
    return ok;
  });
}

/** True after a successful `/health` probe this page session. */
export function isApiReadyCached(): boolean {
  return apiReadyCached;
}

/**
 * Wait until `/health` responds ok, with cold-start retries.
 * Concurrent callers share one in-flight probe chain (max {@link WARMUP_MAX_ATTEMPTS} requests).
 */
export async function waitForApiReady(options?: { signal?: AbortSignal }): Promise<boolean> {
  if (apiReadyCached) return true;
  if (options?.signal?.aborted) return false;

  if (!apiReadyPromise) {
    apiReadyPromise = startApiReadyProbe();
  }

  const shared = apiReadyPromise;
  const signal = options?.signal;
  if (!signal) return shared;

  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const onAbort = () => resolve(false);
    signal.addEventListener("abort", onAbort, { once: true });
    void shared.then((ok) => {
      signal.removeEventListener("abort", onAbort);
      resolve(signal.aborted ? false : ok);
    });
  });
}

/** Fire-and-forget health probe (e.g. on link hover). Skips if already ready or recently probed. */
export function prewarmApi(): void {
  if (typeof window === "undefined") return;
  if (apiReadyCached) return;
  if (apiReadyPromise) return;
  const now = Date.now();
  if (now - lastPrewarmAt < PREWARM_MIN_INTERVAL_MS) return;
  lastPrewarmAt = now;
  void waitForApiReady();
}
