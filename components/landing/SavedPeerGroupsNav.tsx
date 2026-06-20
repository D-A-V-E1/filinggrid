"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { usePeerGroups } from "@/hooks/usePeerGroups";
import { buildPeerSlug } from "@/lib/utils";

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

/** Compact saved-groups dropdown for the landing page header. */
export default function SavedPeerGroupsNav() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { groups, loading, error } = usePeerGroups({ enabled: open });

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
  }, [open, loading, groups.length, error]);

  function openGroup(tickers: string[]) {
    router.push(`/compare/${buildPeerSlug(tickers)}`);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="text-slate-600 hover:text-slate-900"
      >
        Saved groups
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className={`fixed z-50 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${
              menuStyle ? "" : "invisible"
            }`}
            style={menuStyle ?? undefined}
          >
            {loading && <p className="px-3 py-2 text-xs text-slate-400">Loading…</p>}

            {!loading && groups.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-400">No saved groups yet.</p>
            )}

            {!loading &&
              groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => openGroup(group.tickers_list)}
                  className="flex w-full min-w-0 flex-col items-start px-3 py-2 text-left hover:bg-slate-50"
                >
                  <span className="text-xs font-medium text-slate-800">{group.group_name}</span>
                  <span className="mt-0.5 font-mono text-[10px] text-slate-400">
                    {group.tickers_list.join(" · ")}
                  </span>
                </button>
              ))}

            {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
}
