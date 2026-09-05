import type { ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/cn";

export interface FieldProps {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/** Wraps a form control with a label, hint, and error message. */
export function Field({ label, htmlFor, error, hint, required, children, className }: FieldProps) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
          {required && <span className="text-negative"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-sm text-negative" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
