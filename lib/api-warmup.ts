import { checkApiHealth } from "@/lib/api";
import { agentDebugLog } from "@/lib/debug-log";

/** Backoff between API warmup probes (Render cold start can exceed 30s). */
export const WARMUP_BACKOFF_MS = [0, 2000, 5000, 10000, 20000, 30000];

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
  const { signal, location = "lib/api-warmup.ts:retryWithBackoff", isSuccess = () => true } =
    options;

  for (let attempt = 0; attempt < WARMUP_BACKOFF_MS.length; attempt++) {
    if (signal?.aborted) return null;
    if (attempt > 0) {
      try {
        await delay(WARMUP_BACKOFF_MS[attempt] ?? 30000, signal);
      } catch {
        return null;
      }
    }

    const started = Date.now();
    try {
      const result = await fn();
      if (isSuccess(result)) {
        agentDebugLog(location, "warmup ok", { attempt, ms: Date.now() - started }, "H3");
        return result;
      }
      agentDebugLog(
        location,
        "warmup probe not ready",
        { attempt, ms: Date.now() - started },
        "H2"
      );
    } catch (err) {
      agentDebugLog(
        location,
        "warmup failed",
        {
          attempt,
          ms: Date.now() - started,
          error: err instanceof Error ? err.name : "unknown",
        },
        "H1"
      );
    }
  }

  return null;
}

/** Wait until `/health` responds ok, with cold-start retries. */
export async function waitForApiReady(options?: { signal?: AbortSignal }): Promise<boolean> {
  const result = await retryWithBackoff(() => checkApiHealth(), {
    signal: options?.signal,
    location: "lib/api-warmup.ts:waitForApiReady",
    isSuccess: (ok) => ok,
  });
  return result === true;
}

/** Fire-and-forget health probe (e.g. on link hover before navigation). */
export function prewarmApi(): void {
  if (typeof window === "undefined") return;
  void checkApiHealth();
}
