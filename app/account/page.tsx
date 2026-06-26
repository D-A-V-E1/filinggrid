import type { Metadata } from "next";
import { Suspense } from "react";
import AccountPanel from "@/components/account/AccountPanel";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your Peer Disclosures account, plan, and billing.",
};

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">Account</h1>
      <p className="mt-2 text-sm text-slate-600">
        Sign-in, subscription tier, and billing settings.
      </p>
      <div className="mt-8">
        <Suspense fallback={<p className="text-sm text-slate-500">Loading account…</p>}>
          <AccountPanel />
        </Suspense>
      </div>
    </div>
  );
}
