import { describe, expect, it } from "vitest";
import {
  formatMoney,
  minorUnitDigits,
  monthlyInterestMinor,
  parseMoneyInput,
  minorToDecimalString,
} from "./money";

describe("money", () => {
  it("knows minor unit digits", () => {
    expect(minorUnitDigits("USD")).toBe(2);
    expect(minorUnitDigits("JPY")).toBe(0);
  });
  it("formats", () => {
    expect(formatMoney(1250, "USD")).toBe("$12.50");
    expect(formatMoney(-1250, "USD")).toBe("-$12.50");
    expect(formatMoney(1250, "USD", "en-US", { signDisplay: "always" })).toBe("+$12.50");
  });
  it("parses", () => {
    expect(parseMoneyInput("12.50", "USD")).toBe(1250);
    expect(parseMoneyInput("$1,234.5", "USD")).toBe(123450);
    expect(parseMoneyInput("12", "USD")).toBe(1200);
    expect(parseMoneyInput("12.505", "USD")).toBeNull();
    expect(parseMoneyInput("-5", "USD")).toBeNull();
    expect(parseMoneyInput("", "USD")).toBeNull();
    expect(parseMoneyInput("abc", "USD")).toBeNull();
    expect(parseMoneyInput("12,50", "EUR", "de-DE")).toBe(1250);
    expect(parseMoneyInput("1500", "JPY")).toBe(1500);
  });
  it("decimal string", () => {
    expect(minorToDecimalString(1205, "USD")).toBe("12.05");
    expect(minorToDecimalString(-5, "USD")).toBe("-0.05");
    expect(minorToDecimalString(150, "JPY")).toBe("150");
  });
  it("interest", () => {
    expect(monthlyInterestMinor(10000, 500)).toBe(42); // $100 at 5% → $0.42/mo
    expect(monthlyInterestMinor(0, 500)).toBe(0);
    expect(monthlyInterestMinor(10000, 0)).toBe(0);
  });
});
