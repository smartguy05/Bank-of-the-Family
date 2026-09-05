/**
 * All money is stored as integers in the currency's minor unit ("cents").
 * Formatting and parsing use Intl so any family currency works.
 */

const digitsCache = new Map<string, number>();

/** Number of minor-unit digits for a currency (2 for USD/EUR, 0 for JPY, 3 for KWD). */
export function minorUnitDigits(currency: string): number {
  const key = currency.toUpperCase();
  const cached = digitsCache.get(key);
  if (cached !== undefined) return cached;
  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat("en-US", { style: "currency", currency: key }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    digits = 2;
  }
  digitsCache.set(key, digits);
  return digits;
}

export function formatMoney(
  minor: number,
  currency: string,
  locale = "en-US",
  opts: { signDisplay?: "auto" | "always" | "never" | "exceptZero" } = {},
): string {
  const digits = minorUnitDigits(currency);
  const major = minor / 10 ** digits;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    signDisplay: opts.signDisplay ?? "auto",
  }).format(major);
}

/**
 * Parse user input like "12.50", "$12.50", "1,234.5", "12" into minor units.
 * Returns null when the input is not a valid non-negative amount.
 * Uses the locale's decimal separator; falls back to "." if it cannot be detected.
 */
export function parseMoneyInput(input: string, currency: string, locale = "en-US"): number | null {
  const digits = minorUnitDigits(currency);
  const parts = new Intl.NumberFormat(locale).formatToParts(1234.5);
  const decimalSep = parts.find((p) => p.type === "decimal")?.value ?? ".";
  const groupSep = parts.find((p) => p.type === "group")?.value ?? ",";

  let s = input.trim();
  if (!s) return null;
  // strip everything except digits, separators, and a leading minus
  s = s.replace(new RegExp(`[^0-9\\-${escapeRe(decimalSep)}${escapeRe(groupSep)}]`, "g"), "");
  s = s.split(groupSep).join("");
  if (decimalSep !== ".") s = s.replace(decimalSep, ".");
  if (!/^-?\d*(\.\d*)?$/.test(s) || s === "" || s === "-" || s === ".") return null;
  const negative = s.startsWith("-");
  if (negative) return null;
  const [whole = "0", frac = ""] = s.split(".");
  if (frac.length > digits) return null;
  const minor = Number(whole) * 10 ** digits + Number((frac + "0".repeat(digits)).slice(0, digits));
  if (!Number.isSafeInteger(minor)) return null;
  return minor;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Convert minor units to a plain decimal string ("12.50") without currency symbol. */
export function minorToDecimalString(minor: number, currency: string): string {
  const digits = minorUnitDigits(currency);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 10 ** digits);
  const frac = abs % 10 ** digits;
  return digits === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(frac).padStart(digits, "0")}`;
}

/** Monthly interest on a balance: balance × annualRateBps / 10000 / 12, rounded half-up to minor units. */
export function monthlyInterestMinor(balanceMinor: number, annualRateBps: number): number {
  if (balanceMinor <= 0 || annualRateBps <= 0) return 0;
  return Math.round((balanceMinor * annualRateBps) / 10000 / 12);
}
