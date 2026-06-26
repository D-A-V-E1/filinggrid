"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildAuthCallbackUrl } from "@/lib/auth-redirect";
import { isSupabaseConfigured } from "@/lib/auth-config";
import {
  clearOtpSessionForEmail,
  getOtpCooldownRemainingMs,
  getRecentPendingOtpEmail,
  markOtpRequested,
} from "@/lib/otp-session";
import { isCorporateEmail } from "@/lib/utils";
import { isLocalDevHost } from "@/lib/api-environment";
import { clearLocalSignOut, isLocalSignOut } from "@/lib/local-sign-out";
import { resumeStoredSession, waitForBackendAuth } from "@/hooks/useAuth";

function isEmailRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const rec = err as { message?: string; code?: string; status?: number };
  const msg = (rec.message ?? "").toLowerCase();
  return (
    rec.status === 429 ||
    rec.code === "over_email_send_rate_limit" ||
    msg.includes("rate limit")
  );
}

function formatAuthError(err: unknown): string {
  if (isEmailRateLimitError(err)) {
    return "Too many sign-in emails were sent for this address. Supabase limits magic links (often ~4 per hour on free tier). Wait about an hour, try a different email, or use an existing magic link from your inbox.";
  }
  return err instanceof Error ? err.message : "Failed to send magic link";
}

export type MagicLinkStep = "email" | "sent" | "verifying" | "verify_failed" | "done";

interface MagicLinkFormProps {
  returnPath: string;
  /** When true, blocks consumer email domains (Gmail, etc.) — reserved for future enterprise signup. */
  requireCorporateEmail?: boolean;
  submitLabel?: string;
  onComplete?: () => void;
  onStepChange?: (step: MagicLinkStep) => void;
}

export default function MagicLinkForm({
  returnPath,
  requireCorporateEmail = false,
  submitLabel = "Send magic link",
  onComplete,
  onStepChange,
}: MagicLinkFormProps) {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<MagicLinkStep>("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [linkJustSent, setLinkJustSent] = useState(false);
  const [canResumeSession, setCanResumeSession] = useState(false);
  const configured = isSupabaseConfigured();
  const submittingRef = useRef(false);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  useEffect(() => {
    if (!configured) return;
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data: { session } }) => {
      const sessionEmail = session?.user?.email?.trim();
      if (sessionEmail && isLocalSignOut()) {
        setEmail(sessionEmail);
        setCanResumeSession(true);
        return;
      }
      if (sessionEmail && !isLocalSignOut()) {
        setEmail(sessionEmail);
        void waitForBackendAuth(5, 400).then((me) => {
          if (me?.is_authenticated) {
            setStep("done");
            onComplete?.();
          }
        });
        return;
      }
      setCanResumeSession(false);
      const pendingEmail = getRecentPendingOtpEmail();
      if (pendingEmail) {
        setEmail(pendingEmail);
        setLinkJustSent(false);
        setStep("sent");
      }
    });
  }, [configured, onComplete]);

  useEffect(() => {
    if (step !== "sent") return;

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_IN") {
        setStep("verifying");
        const me = await waitForBackendAuth(15, 1000);
        if (me?.is_authenticated) {
          clearOtpSessionForEmail(me.email ?? email);
          setStep("done");
          onComplete?.();
        } else {
          setError(
            isLocalDevHost()
              ? "Signed in, but the API could not verify your session. Is the backend and database running?"
              : "Signed in, but we couldn't verify your session. Please try again in a moment."
          );
          setStep("verify_failed");
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [step, onComplete]);

  async function completeIfAlreadySignedIn(
    trimmedEmail: string,
    sessionEmail: string | undefined
  ): Promise<boolean> {
    if (!sessionEmail || sessionEmail.toLowerCase() !== trimmedEmail.toLowerCase()) {
      return false;
    }
    if (isLocalSignOut()) {
      const resumed = await resumeStoredSession();
      if (!resumed) return false;
    }
    setStep("verifying");
    const me = await waitForBackendAuth(15, 1000);
    if (me?.is_authenticated) {
      clearOtpSessionForEmail(me.email ?? trimmedEmail);
      setStep("done");
      onComplete?.();
      return true;
    }
    setError(
      "Could not restore your session. Try sending a magic link, or sign out everywhere from Account."
    );
    setStep("verify_failed");
    return true;
  }

  async function handleSubmit() {
    if (submittingRef.current || loading) return;

    const trimmedEmail = email.trim();
    const cooldownMs = getOtpCooldownRemainingMs(trimmedEmail);

    setError("");
    if (!configured) {
      setError("Sign-in is not configured. Add Supabase keys to .env (see README).");
      return;
    }
    if (requireCorporateEmail && !isCorporateEmail(email)) {
      setError(
        "Enterprise signup requires a work email. Consumer providers (Gmail, Yahoo, Outlook personal, etc.) are not accepted."
      );
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionEmail = sessionData.session?.user?.email?.trim();

      if (sessionEmail && sessionEmail.toLowerCase() !== trimmedEmail.toLowerCase()) {
        await supabase.auth.signOut();
        clearLocalSignOut();
        clearOtpSessionForEmail(sessionEmail);
      } else if (await completeIfAlreadySignedIn(trimmedEmail, sessionEmail)) {
        return;
      }

      if (cooldownMs > 0) {
        setLinkJustSent(false);
        setStep("sent");
        return;
      }

      const { error: authError } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: { emailRedirectTo: buildAuthCallbackUrl(returnPath) },
      });
      if (authError) throw authError;
      markOtpRequested(trimmedEmail);
      setLinkJustSent(true);
      setStep("sent");
    } catch (err) {
      if (isEmailRateLimitError(err)) {
        markOtpRequested(trimmedEmail);
      }
      setError(formatAuthError(err));
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  if (!configured) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Authentication is not set up on this environment. Configure{" "}
        <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
        <code className="font-mono text-xs">.env</code>.
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-800">
        You&apos;re signed in. This window will update automatically.
      </div>
    );
  }

  if (step === "verifying") {
    return (
      <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
        Completing sign-in…
      </div>
    );
  }

  if (step === "verify_failed") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Sign-in needs a moment</p>
          <p className="mt-1">{error}</p>
        </div>
        <p className="text-xs text-slate-500">
          <button
            type="button"
            className="text-brand-700 underline"
            onClick={() => {
              setError("");
              setStep("email");
            }}
          >
            Try again
          </button>
        </p>
      </div>
    );
  }

  if (step === "sent") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-800">
          <p className="font-medium">Check your inbox</p>
          <p className="mt-1">
            {linkJustSent ? (
              <>
                We sent a sign-in link to <span className="font-medium">{email}</span>. Click it in
                this browser — you&apos;ll return here automatically.
              </>
            ) : (
              <>
                A sign-in link was recently sent to <span className="font-medium">{email}</span>.
                Check your inbox (including spam) — another email was not sent.
              </>
            )}
          </p>
        </div>
        <p className="text-xs text-slate-500">
          Link didn&apos;t arrive? Check spam. You can request another link after the cooldown, or{" "}
          <button
            type="button"
            className="text-brand-700 underline"
            onClick={() => {
              setError("");
              setStep("email");
            }}
          >
            use a different email
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requireCorporateEmail ? (
        <p className="text-xs leading-relaxed text-slate-500">
          Enterprise signup is for institutional users. Use your <strong>work email</strong> —
          consumer providers like Gmail and Yahoo are not accepted.
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-slate-500">
          First time on this device? We&apos;ll email a one-time magic link. After that, signing
          back in with the same email on this browser won&apos;t send another email.
        </p>
      )}
      <input
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setCanResumeSession(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && email.trim() && !loading && !submittingRef.current) {
            void handleSubmit();
          }
        }}
        placeholder={requireCorporateEmail ? "you@company.com" : "you@email.com"}
        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        autoComplete="email"
      />
      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={loading || !email.trim()}
        className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {loading
          ? "Signing in…"
          : canResumeSession
            ? "Sign back in"
            : submitLabel}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
