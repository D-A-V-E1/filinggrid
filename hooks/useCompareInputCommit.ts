"use client";

import { useCallback, useState } from "react";

/**
 * Tracks whether React state has caught up to the latest compare cache key.
 * While pending, delta scan/counter should show settling — not stale prior-compare data.
 */
export function useCompareInputCommit(cacheKey: string) {
  const [committedKey, setCommittedKey] = useState(cacheKey);
  const inputsPending = committedKey !== cacheKey;

  const commitKey = useCallback(() => {
    setCommittedKey(cacheKey);
  }, [cacheKey]);

  return { inputsPending, commitKey };
}
