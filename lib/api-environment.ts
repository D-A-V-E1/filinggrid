/** True when the UI is served from local dev (not production Vercel). */
export function isLocalDevHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

/** Shown while cold-start retries are still in progress. */
export function apiWarmingMessage(): string {
  return "Connecting to SEC data… This may take a moment on first load.";
}

export function apiUnreachableHint(): string {
  if (isLocalDevHost()) {
    return "Start the backend on port 8000 (start.bat or run-api.bat), then refresh.";
  }
  return "This may take a moment after idle time. Wait a few seconds and refresh the page.";
}

export function apiUnreachableBannerMessage(): string {
  if (isLocalDevHost()) {
    return `API unreachable — ${apiUnreachableHint()}`;
  }
  return "Unable to load filings right now. Please wait a moment and try again.";
}

/** User-facing copy when the API proxy returns a gateway error (502/503/504). */
export function apiGatewayErrorMessage(status?: number): string | null {
  if (status !== 502 && status !== 503 && status !== 504) return null;
  if (isLocalDevHost()) {
    return "The API is temporarily unavailable. Start the backend on port 8000, then try again.";
  }
  return "Our servers are waking up after a brief pause. Wait a few seconds and try again.";
}

export function checkoutUnavailableMessage(): string {
  if (isLocalDevHost()) {
    return "Checkout is unavailable while the API is offline. Start the backend on port 8000.";
  }
  return "Checkout is temporarily unavailable. Wait a moment and try again.";
}

export function tickerSearchUnavailableMessage(): string {
  if (isLocalDevHost()) {
    return "Ticker search unavailable — is the API running on port 8000?";
  }
  return "Ticker search is temporarily unavailable. Try again in a few seconds.";
}
