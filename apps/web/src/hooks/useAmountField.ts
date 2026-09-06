import { useState } from "react";
import { useFamilyFormat } from "@/hooks/useFamilyFormat";

export function useAmountField() {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { parse } = useFamilyFormat();
  return {
    raw,
    setRaw,
    error,
    setError,
    resolve(): number | null {
      const minor = parse(raw);
      if (minor === null || minor <= 0) {
        setError("Enter a valid amount greater than zero");
        return null;
      }
      setError(null);
      return minor;
    },
  };
}
