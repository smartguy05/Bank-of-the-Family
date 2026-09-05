import { useCallback, useMemo } from "react";
import { formatMoney, parseMoneyInput } from "@botf/shared";
import { useMe } from "@/hooks/useMe";

export interface FamilyFormat {
  currencyCode: string;
  locale: string;
  /** Format minor units into a display string, e.g. "$12.50". */
  fmt: (
    minor: number,
    opts?: { signDisplay?: "auto" | "always" | "never" | "exceptZero" },
  ) => string;
  /** Parse user input into minor units, or null if invalid. */
  parse: (input: string) => number | null;
}

/** Money formatting/parsing bound to the signed-in family's currency and locale. */
export function useFamilyFormat(): FamilyFormat {
  const { data: me } = useMe();
  const currencyCode = me?.family?.currencyCode ?? "USD";
  const locale = me?.family?.locale ?? "en-US";

  const fmt = useCallback<FamilyFormat["fmt"]>(
    (minor, opts) => formatMoney(minor, currencyCode, locale, opts),
    [currencyCode, locale],
  );
  const parse = useCallback<FamilyFormat["parse"]>(
    (input) => parseMoneyInput(input, currencyCode, locale),
    [currencyCode, locale],
  );

  return useMemo(() => ({ currencyCode, locale, fmt, parse }), [currencyCode, locale, fmt, parse]);
}
