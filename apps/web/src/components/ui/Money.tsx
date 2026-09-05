import { useFamilyFormat } from "@/hooks/useFamilyFormat";
import { cn } from "@/lib/cn";

export interface MoneyProps {
  minor: number;
  /** Colors positive green / negative red. Off by default (most balances are neutral ink). */
  signColor?: boolean;
  signDisplay?: "auto" | "always" | "never" | "exceptZero";
  className?: string;
}

export function Money({ minor, signColor = false, signDisplay = "auto", className }: MoneyProps) {
  const { fmt } = useFamilyFormat();
  return (
    <span
      className={cn(
        "tabular",
        signColor && (minor > 0 ? "text-positive" : minor < 0 ? "text-negative" : undefined),
        className,
      )}
    >
      {fmt(minor, { signDisplay })}
    </span>
  );
}
