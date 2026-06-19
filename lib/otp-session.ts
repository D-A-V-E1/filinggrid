/** Client-side magic-link request throttling (per email, per browser tab). */

export const OTP_COOLDOWN_MS = 60_000;
const OTP_COOLDOWN_PREFIX = "filinggrid:otp-last-sent:";
const OTP_PENDING_PREFIX = "filinggrid:otp-pending:";

function otpCooldownKey(email: string): string {
  return `${OTP_COOLDOWN_PREFIX}${email.trim().toLowerCase()}`;
}

function otpPendingKey(email: string): string {
  return `${OTP_PENDING_PREFIX}${email.trim().toLowerCase()}`;
}

export function getOtpCooldownRemainingMs(email: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = sessionStorage.getItem(otpCooldownKey(email));
    if (!raw) return 0;
    return Math.max(0, OTP_COOLDOWN_MS - (Date.now() - Number(raw)));
  } catch {
    return 0;
  }
}

export function markOtpRequested(email: string): void {
  if (typeof window === "undefined") return;
  const normalized = email.trim().toLowerCase();
  try {
    const now = String(Date.now());
    sessionStorage.setItem(otpCooldownKey(normalized), now);
    sessionStorage.setItem(otpPendingKey(normalized), now);
  } catch {
    /* sessionStorage unavailable */
  }
}

export function hasPendingOtp(email: string): boolean {
  return getOtpCooldownRemainingMs(email) > 0;
}

export function clearOtpSessionForEmail(email: string): void {
  if (typeof window === "undefined") return;
  const normalized = email.trim().toLowerCase();
  try {
    sessionStorage.removeItem(otpCooldownKey(normalized));
    sessionStorage.removeItem(otpPendingKey(normalized));
  } catch {
    /* ignore */
  }
}

export function getRecentPendingOtpEmail(): string | null {
  if (typeof window === "undefined") return null;
  let bestEmail: string | null = null;
  let bestTs = 0;
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith(OTP_COOLDOWN_PREFIX)) continue;
      const email = key.slice(OTP_COOLDOWN_PREFIX.length);
      if (getOtpCooldownRemainingMs(email) <= 0) continue;
      const ts = Number(sessionStorage.getItem(key) ?? 0);
      if (ts >= bestTs) {
        bestTs = ts;
        bestEmail = email;
      }
    }
  } catch {
    /* ignore */
  }
  return bestEmail;
}

export function clearAllOtpSession(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (
        key &&
        (key.startsWith(OTP_COOLDOWN_PREFIX) || key.startsWith(OTP_PENDING_PREFIX))
      ) {
        keys.push(key);
      }
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
