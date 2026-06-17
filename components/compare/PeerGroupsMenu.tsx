"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import SignInModal from "@/components/auth/SignInModal";
import {
  ApiError,
  createPeerGroup,
  deletePeerGroup,
  formatApiError,
  listPeerGroups,
  type PeerGroup,
} from "@/lib/api";
import { isDevTierToggleEnabled } from "@/lib/dev-tier";
import { buildPeerSlug } from "@/lib/utils";

interface PeerGroupsMenuProps {
  tickers: string[];
  fiscalYear?: number;
  tier: string;
  isSignedIn: boolean;
  authConfigured: boolean;
  onPaywall: (reason: string, message: string) => void;
}

export default function PeerGroupsMenu({
  tickers,
  fiscalYear,
  tier,
  isSignedIn,
  authConfigured,
  onPaywall,
}: PeerGroupsMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnPath =
    pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");

  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<PeerGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [signInOpen, setSignInOpen] = useState(false);

  const isPro = tier === "professional";
  const devProLocal = isDevTierToggleEnabled() && isPro;
  const needsSignIn = isPro && !isSignedIn && authConfigured && !devProLocal;

  const handleApiError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ApiError && err.isPaywall) {
        const detail = err.detail as { reason?: string; message?: string };
        onPaywall(
          detail.reason || "subscription_required",
          detail.message || "This feature requires a Professional subscription."
        );
        return;
      }
      if (err instanceof ApiError && err.isUnauthorized) {
        setSignInOpen(true);
        setError("Sign in to save and load peer groups.");
        return;
      }
      setError(formatApiError(err, fallback));
    },
    [onPaywall]
  );

  const loadGroups = useCallback(async () => {
    if (!isPro) return;
    setLoading(true);
    setError("");
    try {
      setGroups(await listPeerGroups());
    } catch (err) {
      handleApiError(err, "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }, [handleApiError, isPro]);

  useEffect(() => {
    if (open && isPro && !needsSignIn) {
      void loadGroups();
    }
  }, [open, isPro, needsSignIn, loadGroups]);

  function handleOpen() {
    if (!isPro) {
      onPaywall(
        "subscription_required",
        "Saved peer groups are available on the Professional plan."
      );
      return;
    }
    if (needsSignIn) {
      setSignInOpen(true);
      return;
    }
    setOpen((prev) => !prev);
  }

  function loadGroup(group: PeerGroup) {
    const slug = buildPeerSlug(group.tickers_list);
    const currentYear = new Date().getFullYear();
    const url =
      fiscalYear && fiscalYear !== currentYear
        ? `/compare/${slug}?year=${fiscalYear}`
        : `/compare/${slug}`;
    router.push(url);
    setOpen(false);
  }

  async function handleSave() {
    if (!groupName.trim() || tickers.length < 2) return;
    setSaving(true);
    setError("");
    try {
      await createPeerGroup(groupName.trim(), tickers);
      setGroupName("");
      setSaveOpen(false);
      await loadGroups();
    } catch (err) {
      handleApiError(err, "Failed to save group");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(groupId: string, e: MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this saved group?")) return;
    setError("");
    try {
      await deletePeerGroup(groupId);
      await loadGroups();
    } catch (err) {
      handleApiError(err, "Failed to delete group");
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Saved groups
      </button>

      {open && isPro && !needsSignIn && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <div className="border-b border-slate-100 px-3 py-2">
              <button
                type="button"
                onClick={() => setSaveOpen((v) => !v)}
                disabled={tickers.length < 2}
                className="text-xs font-medium text-brand-700 hover:text-brand-800 disabled:opacity-40"
              >
                + Save current comparison
              </button>
              {devProLocal && !isSignedIn && (
                <p className="mt-1 text-[10px] leading-relaxed text-amber-800/80">
                  Dev mode: groups are stored in memory until the API restarts. Sign in to persist in
                  PostgreSQL.
                </p>
              )}
            </div>

            {saveOpen && (
              <div className="space-y-2 border-b border-slate-100 px-3 py-2">
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Group name (e.g. Mega-cap tech)"
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSave();
                  }}
                />
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !groupName.trim()}
                  className="w-full rounded bg-brand-600 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            )}

            {loading && <p className="px-3 py-2 text-xs text-slate-400">Loading…</p>}

            {!loading && groups.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-400">No saved groups yet.</p>
            )}

            {!loading &&
              groups.map((group) => (
                <div key={group.id} className="flex items-center hover:bg-slate-50">
                  <button
                    type="button"
                    onClick={() => loadGroup(group)}
                    className="flex min-w-0 flex-1 flex-col items-start px-3 py-2 text-left"
                  >
                    <span className="text-xs font-medium text-slate-800">{group.group_name}</span>
                    <span className="mt-0.5 font-mono text-[10px] text-slate-400">
                      {group.tickers_list.join(" · ")}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => void handleDelete(group.id, e)}
                    className="shrink-0 px-2 text-slate-400 hover:text-red-600"
                    aria-label={`Delete ${group.group_name}`}
                  >
                    ×
                  </button>
                </div>
              ))}

            {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}
          </div>
        </>
      )}

      <SignInModal
        open={signInOpen}
        returnPath={returnPath}
        onClose={() => setSignInOpen(false)}
        onSignedIn={() => {
          setSignInOpen(false);
          setOpen(true);
          void loadGroups();
        }}
      />
    </div>
  );
}
