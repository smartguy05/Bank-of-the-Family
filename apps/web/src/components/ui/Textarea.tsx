import type { TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-24 w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink placeholder:text-muted",
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
