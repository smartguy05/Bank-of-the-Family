import { cn } from "@/lib/cn";

export interface AvatarProps {
  name: string;
  color?: string | null;
  emoji?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = { sm: "h-8 w-8 text-sm", md: "h-11 w-11 text-lg", lg: "h-16 w-16 text-2xl" };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

export function Avatar({ name, color, emoji, size = "md", className }: AvatarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        sizeClasses[size],
        className,
      )}
      style={{ backgroundColor: color ?? "#22579f" }}
      aria-hidden="true"
    >
      {emoji ?? initials(name)}
    </div>
  );
}
