/** Dispatched to open the global sign-in modal (see HeaderNav). */
export const AUTH_SIGN_IN_REQUEST_EVENT = "filinggrid:open-sign-in";

export interface AuthErrorDetails {
  errorCode: string | null;
  errorDescription: string | null;
}

/** Parse Supabase OAuth/magic-link errors from the URL hash fragment. */
export function parseAuthHashError(): AuthErrorDetails | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash || hash.length <= 1) return null;

  const params = new URLSearchParams(hash.slice(1));
  const error = params.get("error");
  const errorCode = params.get("error_code");
  if (!error && !errorCode) return null;

  return {
    errorCode: errorCode ?? error,
    errorDescription: params.get("error_description"),
  };
}

export function getAuthErrorMessage(errorCode: string | null | undefined): string {
  switch (errorCode) {
    case "otp_expired":
      return "This sign-in link has expired. Request a new magic link below.";
    case "validation_failed":
      return "This sign-in link is invalid. Request a new magic link below.";
    case "otp_disabled":
      return "Email sign-in is temporarily unavailable. Please try again later.";
    default:
      return "Sign-in failed. Check your link or try again.";
  }
}

export function shouldOfferNewMagicLink(errorCode: string | null | undefined): boolean {
  return errorCode === "otp_expired" || errorCode === "validation_failed" || !errorCode;
}

export function requestOpenSignIn(): void {
  window.dispatchEvent(new CustomEvent(AUTH_SIGN_IN_REQUEST_EVENT));
}

/** Strip auth error params from a path + query string (hash is client-only). */
export function cleanAuthErrorFromUrl(pathname: string, queryString: string): string {
  const params = new URLSearchParams(queryString);
  params.delete("auth");
  params.delete("error_code");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
