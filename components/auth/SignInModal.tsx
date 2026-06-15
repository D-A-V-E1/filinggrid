"use client";

import { useEffect, useState } from "react";
import MagicLinkForm from "@/components/auth/MagicLinkForm";

interface SignInModalProps {
  open: boolean;
  returnPath: string;
  onClose: () => void;
  onSignedIn?: () => void;
}

export default function SignInModal({ open, returnPath, onClose, onSignedIn }: SignInModalProps) {
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (!open) {
      setKey((k) => k + 1);
    }
  }, [open]);

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
        <p className="mt-2 text-sm text-slate-600">
          Passwordless magic link — we&apos;ll email you a one-time sign-in link.
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
      </div>
    </div>
  );
}
