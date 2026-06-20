"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  deletePeerGroup,
  formatApiError,
  listPeerGroups,
  type PeerGroup,
} from "@/lib/api";

interface UsePeerGroupsOptions {
  enabled?: boolean;
  onUnauthorized?: () => void;
}

export function usePeerGroups({ enabled = true, onUnauthorized }: UsePeerGroupsOptions = {}) {
  const [groups, setGroups] = useState<PeerGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      setGroups(await listPeerGroups());
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthorized) {
        onUnauthorized?.();
        setError("Sign in to load saved peer groups.");
        return;
      }
      setError(formatApiError(err, "Failed to load saved peer groups"));
    } finally {
      setLoading(false);
    }
  }, [enabled, onUnauthorized]);

  useEffect(() => {
    if (enabled) {
      void load();
    }
  }, [enabled, load]);

  const remove = useCallback(
    async (groupId: string) => {
      setError("");
      try {
        await deletePeerGroup(groupId);
        await load();
      } catch (err) {
        if (err instanceof ApiError && err.isUnauthorized) {
          onUnauthorized?.();
          setError("Sign in to manage saved peer groups.");
          return;
        }
        setError(formatApiError(err, "Failed to delete group"));
      }
    },
    [load, onUnauthorized]
  );

  return { groups, loading, error, reload: load, remove };
}
