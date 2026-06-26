/** Debug session logging — no-op outside browser; never log secrets. */
export function agentDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown> = {},
  hypothesisId?: string
): void {
  if (typeof window === "undefined") return;
  // #region agent log
  fetch("http://127.0.0.1:7636/ingest/dc8d821f-a622-4822-8d35-7735b0c14d6f", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "96f674" },
    body: JSON.stringify({
      sessionId: "96f674",
      location,
      message,
      data,
      hypothesisId,
      timestamp: Date.now(),
      runId: data.runId ?? "pre-fix",
    }),
  }).catch(() => {});
  // #endregion
}
