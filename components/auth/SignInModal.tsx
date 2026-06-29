"use client";

import { useEffect } from "react";
import MagicLinkForm from "@/components/auth/MagicLinkForm";
import { useAuth } from "@/hooks/useAuth";

interface SignInModalProps {
  open: boolean;
  returnPath: string;
  onClose: () => void;
  onSignedIn?: () => void;
}

export default function SignInModal({ open, returnPath, onClose, onSignedIn }: SignInModalProps) {
  const { auth, loading, isSignedIn, supabaseEmail, refresh } = useAuth();
  const sessionEmail = auth?.email ?? supabaseEmail;
  const hasActiveSession = isSignedIn || Boolean(supabaseEmail);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
          aria-label="Close"
        >
          ×
        </button>

        <h2 id="signin-title" className="text-xl font-semibold text-slate-900">
          Sign in to Peer Disclosures
        </h2>

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Checking your session…</p>
        ) : hasActiveSession && sessionEmail ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-800">
              <p className="font-medium">You&apos;re already signed in</p>
              <p className="mt-1">
                Signed in as <span className="font-medium">{sessionEmail}</span>. Return visits stay
                signed in until you sign out or clear browser cookies — no new magic link needed.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onSignedIn?.();
                onClose();
              }}
              className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Continue
            </button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600">
              First time on this device? Peer Disclosures will email a one-time sign-in link. After
              you sign out, signing back in with the same email here won&apos;t send another email.
            </p>
            <div className="mt-6">
              <MagicLinkForm
                returnPath={returnPath}
                requireCorporateEmail={false}
                onComplete={() => {
                  onSignedIn?.();
                  onClose();
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
