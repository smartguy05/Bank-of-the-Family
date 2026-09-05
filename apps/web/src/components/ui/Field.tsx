import type { ReactNode } from "react";
import { Children, cloneElement, isValidElement, useId } from "react";
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

/**
 * Wraps a form control with a label, hint, and error message.
 * When `htmlFor` is not given and the child is a single element without an `id`, an id is
 * generated and injected so the label is always associated with the control; `aria-invalid`
 * and `aria-describedby` are wired to the error/hint text.
 */
export function Field({ label, htmlFor, error, hint, required, children, className }: FieldProps) {
  const autoId = useId();
  const descId = `${autoId}-desc`;
  const only = Children.count(children) === 1 ? Children.only(children) : null;
  const childId =
    only && isValidElement<{ id?: string }>(only) && only.props.id ? only.props.id : undefined;
  const id = htmlFor ?? childId ?? autoId;
  const describedBy = error || hint ? descId : undefined;

  const control =
    only && isValidElement<Record<string, unknown>>(only) && !htmlFor
      ? cloneElement(only, {
          id: only.props.id ?? id,
          "aria-invalid": error ? true : (only.props["aria-invalid"] ?? undefined),
          "aria-describedby": describedBy ?? only.props["aria-describedby"],
        })
      : children;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
          {required && <span className="text-negative"> *</span>}
        </label>
      )}
      {control}
      {error ? (
        <p id={descId} className="text-sm text-negative" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={descId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
