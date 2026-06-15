/** Default compare workspace when no return path is provided. */
export const DEFAULT_COMPARE_PATH = "/compare/aapl-vs-msft";

/**
 * Sanitize a post-auth or post-checkout return path.
 * Rejects open redirects and maps legacy `/compare` to a real slug route.
 */
export function sanitizeReturnPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }
  if (next === "/compare") {
    return DEFAULT_COMPARE_PATH;
  }
  if (next.startsWith("/compare?")) {
    return `${DEFAULT_COMPARE_PATH}${next.slice("/compare".length)}`;
  }
  if (next.startsWith("/auth/")) {
    return fallback;
  }
  return next;
}

export function buildAuthCallbackUrl(returnPath: string): string {
  const safePath = sanitizeReturnPath(returnPath, DEFAULT_COMPARE_PATH);
  const params = new URLSearchParams({ next: safePath });
  return `${window.location.origin}/auth/callback?${params.toString()}`;
}

export function appendQueryParam(path: string, key: string, value: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}
