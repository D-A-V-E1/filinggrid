"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
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

const VIEWPORT_PADDING = 8;
const MENU_GAP = 4;

function computeMenuPosition(
  trigger: DOMRect,
  panel: { width: number; height: number }
): CSSProperties {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = trigger.right - panel.width;
  left = Math.max(VIEWPORT_PADDING, left);
  left = Math.min(left, viewportWidth - VIEWPORT_PADDING - panel.width);

  const spaceBelow = viewportHeight - trigger.bottom - VIEWPORT_PADDING - MENU_GAP;
  const spaceAbove = trigger.top - VIEWPORT_PADDING - MENU_GAP;
  const preferBelow = spaceBelow >= panel.height || spaceBelow >= spaceAbove;

  let top: number;
  let maxHeight: number;
  if (preferBelow) {
    top = trigger.bottom + MENU_GAP;
    maxHeight = spaceBelow;
  } else {
    maxHeight = spaceAbove;
    const visibleHeight = Math.min(panel.height, maxHeight);
    top = Math.max(VIEWPORT_PADDING, trigger.top - MENU_GAP - visibleHeight);
  }

  return { top, left, maxHeight };
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
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }

    function updatePosition() {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;

      setMenuStyle(
        computeMenuPosition(trigger.getBoundingClientRect(), {
          width: panel.offsetWidth,
          height: panel.offsetHeight,
        })
      );
    }

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, saveOpen, loading, groups.length, error]);

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
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Saved groups
      </button>

      {open && isPro && !needsSignIn && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className={`fixed z-50 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${
              menuStyle ? "" : "invisible"
            }`}
            style={menuStyle ?? undefined}
          >
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
