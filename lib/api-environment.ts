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

export function tickerSearchUnavailableMessage(): string {
  if (isLocalDevHost()) {
    return "Ticker search unavailable — is the API running on port 8000?";
  }
  return "Ticker search is temporarily unavailable. Try again in a few seconds.";
}
