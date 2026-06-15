"use client";

interface ApiHealthBannerProps {
  healthy: boolean | null;
}

export default function ApiHealthBanner({ healthy }: ApiHealthBannerProps) {
  if (healthy !== false) return null;

  return (
    <div
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900"
      role="alert"
    >
      API unreachable — start the backend on port 8000 (<code className="font-mono">start.bat</code> or{" "}
      <code className="font-mono">run-api.bat</code>), then refresh.
    </div>
  );
}
