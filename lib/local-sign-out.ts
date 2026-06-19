/** App-level sign-out: hide signed-in UI but keep Supabase session for same-device re-auth. */

const LOCAL_SIGN_OUT_KEY = "filinggrid:local-sign-out";

export function isLocalSignOut(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(LOCAL_SIGN_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setLocalSignOut(active: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (active) {
      sessionStorage.setItem(LOCAL_SIGN_OUT_KEY, "1");
    } else {
      sessionStorage.removeItem(LOCAL_SIGN_OUT_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function clearLocalSignOut(): void {
  setLocalSignOut(false);
}
