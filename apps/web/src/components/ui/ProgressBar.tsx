import { cn } from "@/lib/cn";

export function ProgressBar({
  value,
  className,
  trackClassName,
}: {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  className?: string;
  trackClassName?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface", trackClassName)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full bg-accent-500 transition-[width]", className)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
