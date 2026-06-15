"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildAuthCallbackUrl } from "@/lib/auth-redirect";
import { isSupabaseConfigured } from "@/lib/auth-config";
import { isCorporateEmail } from "@/lib/utils";
import { waitForBackendAuth } from "@/hooks/useAuth";

export type MagicLinkStep = "email" | "sent" | "verifying" | "done";

interface MagicLinkFormProps {
  returnPath: string;
  /** When true, blocks consumer email domains (Gmail, etc.) — used for Professional upgrade. */
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
  const configured = isSupabaseConfigured();

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

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
          setStep("done");
          onComplete?.();
        } else {
          setError(
            "Signed in, but the API could not verify your session. Is the backend and database running?"
          );
          setStep("sent");
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [step, onComplete]);

  async function handleSubmit() {
    setError("");
    if (!configured) {
      setError("Sign-in is not configured. Add Supabase keys to .env (see README).");
      return;
    }
    if (requireCorporateEmail && !isCorporateEmail(email)) {
      setError(
        "Professional requires a work email. Consumer providers (Gmail, Yahoo, Outlook personal, etc.) are not accepted."
      );
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: buildAuthCallbackUrl(returnPath) },
      });
      if (authError) throw authError;
      setStep("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send magic link");
    } finally {
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

  if (step === "sent") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-800">
          <p className="font-medium">Check your inbox</p>
          <p className="mt-1">
            We sent a sign-in link to <span className="font-medium">{email}</span>. Click it in
            this browser — you&apos;ll return here automatically.
          </p>
        </div>
        <p className="text-xs text-slate-500">
          Link didn&apos;t arrive? Check spam, or{" "}
          <button
            type="button"
            className="text-brand-700 underline"
            onClick={() => setStep("email")}
          >
            try again
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
          Professional is for institutional users. Use your <strong>work email</strong> — consumer
          providers like Gmail and Yahoo are blocked at checkout.
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-slate-500">
          Sign in with any email. A <strong>work email</strong> is only required when upgrading to
          Professional.
        </p>
      )}
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && email && handleSubmit()}
        placeholder={requireCorporateEmail ? "you@company.com" : "you@email.com"}
        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        autoComplete="email"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || !email.trim()}
        className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {loading ? "Sending…" : submitLabel}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
