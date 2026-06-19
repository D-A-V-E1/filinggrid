"use client";

import { useEffect, useState } from "react";
import MagicLinkForm from "@/components/auth/MagicLinkForm";
import { useAuth } from "@/hooks/useAuth";

interface SignInModalProps {
  open: boolean;
  returnPath: string;
  onClose: () => void;
  onSignedIn?: () => void;
}

export default function SignInModal({ open, returnPath, onClose, onSignedIn }: SignInModalProps) {
  const [key, setKey] = useState(0);
  const { auth, loading, isSignedIn, refresh } = useAuth();

  useEffect(() => {
    if (!open) {
      setKey((k) => k + 1);
      return;
    }
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
          Sign in to FilingGrid
        </h2>

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Checking your session…</p>
        ) : isSignedIn && auth ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-800">
              <p className="font-medium">You&apos;re already signed in</p>
              <p className="mt-1">
                Signed in as <span className="font-medium">{auth.email}</span>. Return visits stay
                signed in until you sign out or clear browser cookies.
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
              First time on this device? We&apos;ll email a one-time magic link. After that, your
              session persists across visits — no password needed.
            </p>
            <div className="mt-6" key={key}>
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
