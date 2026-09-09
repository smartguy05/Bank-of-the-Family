import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-lg border bg-card px-3 text-sm text-ink placeholder:text-muted",
        "focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent",
        invalid ? "border-negative" : "border-line",
        rest.disabled && "opacity-60 cursor-not-allowed bg-surface",
        className,
      )}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});
