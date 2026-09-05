import type { ClipboardEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface PinInputProps {
  length?: 4 | 5 | 6;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  "aria-label"?: string;
}

/** Numeric PIN entry with one large box per digit. Digits are masked as dots. */
export function PinInput({
  length = 4,
  value,
  onChange,
  onComplete,
  autoFocus,
  disabled,
  invalid,
  "aria-label": ariaLabel = "PIN",
}: PinInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState(0);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function setDigitAt(index: number, digit: string) {
    const next = value.split("");
    next[index] = digit;
    const joined = next.join("").slice(0, length);
    onChange(joined);
    if (joined.length === length) onComplete?.(joined);
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) {
      setDigitAt(index, "");
      return;
    }
    setDigitAt(index, digit);
    if (index < length - 1) {
      refs.current[index + 1]?.focus();
      setFocusIndex(index + 1);
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) {
        setDigitAt(index, "");
      } else if (index > 0) {
        refs.current[index - 1]?.focus();
        setFocusIndex(index - 1);
        setDigitAt(index - 1, "");
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
      setFocusIndex(index - 1);
    } else if (e.key === "ArrowRight" && index < length - 1) {
      refs.current[index + 1]?.focus();
      setFocusIndex(index + 1);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!text) return;
    e.preventDefault();
    onChange(text);
    if (text.length === length) onComplete?.(text);
    const focusAt = Math.min(text.length, length - 1);
    refs.current[focusAt]?.focus();
    setFocusIndex(focusAt);
  }

  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-2">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onFocus={() => setFocusIndex(i)}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          aria-label={`Digit ${i + 1} of ${length}`}
          className={cn(
            "h-14 w-12 rounded-lg border bg-white text-center text-2xl font-semibold text-ink",
            "focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent",
            invalid ? "border-negative" : "border-line",
            disabled && "opacity-60 cursor-not-allowed bg-surface",
            focusIndex === i && "ring-2 ring-accent-500",
          )}
        />
      ))}
    </div>
  );
}
