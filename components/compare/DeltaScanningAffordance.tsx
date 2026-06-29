import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Small hourglass icon — signals scan in progress without replacing the live count. */
export function DeltaScanningIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn("shrink-0 animate-pulse text-slate-400", className)}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path
        d="M3 1.5h6M3 10.5h6M4 1.5l2 4.5-2 4.5M8 1.5L6 6l2 4.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function deltaScanningTitleClass(scanning: boolean): string {
  return scanning ? "border-b border-dashed border-slate-400/70 pb-px" : "";
}

interface DeltaScanningTitleProps {
  scanning: boolean;
  children: ReactNode;
  className?: string;
  iconClassName?: string;
}

/** Title row with optional hourglass + dashed underline while scan is in flight. */
export function DeltaScanningTitle({
  scanning,
  children,
  className,
  iconClassName,
}: DeltaScanningTitleProps) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {scanning && <DeltaScanningIcon className={iconClassName} />}
      <span className={cn("min-w-0 truncate", deltaScanningTitleClass(scanning))}>{children}</span>
    </span>
  );
}
