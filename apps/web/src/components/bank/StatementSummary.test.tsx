import { describe, expect, it, vi } from "vitest";
import type { Statement } from "@botf/shared";
import { StatementSummary } from "@/components/bank/StatementView";
import { renderToDom } from "@/test/render";

vi.mock("@/hooks/useFamilyFormat", () => ({
  useFamilyFormat: () => ({
    currencyCode: "USD",
    locale: "en-US",
    fmt: (minor: number) => `$${(minor / 100).toFixed(2)}`,
    parse: () => null,
  }),
}));

function makeStatement(overrides: Partial<Statement> = {}): Statement {
  return {
    accountId: "acc_1",
    accountName: "Checking",
    accountNumber: "4821-0093-1207",
    ownerName: "Jamie Kid",
    familyName: "The Smiths",
    currencyCode: "USD",
    locale: "en-US",
    period: "2026-08",
    periodStart: "2026-08-01T00:00:00Z",
    periodEnd: "2026-08-31T23:59:59Z",
    openingBalanceMinor: 1000,
    closingBalanceMinor: 1500,
    totalCreditsMinor: 800,
    totalDebitsMinor: 300,
    interestMinor: 0,
    transactionCount: 3,
    transactions: [],
    ...overrides,
  };
}

describe("StatementSummary", () => {
  it("renders every summary row with a formatted amount", () => {
    const { container, unmount } = renderToDom(<StatementSummary statement={makeStatement()} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Opening balance");
    expect(text).toContain("$10.00");
    expect(text).toContain("Deposits & credits");
    expect(text).toContain("$8.00");
    expect(text).toContain("Withdrawals & debits");
    expect(text).toContain("$3.00");
    expect(text).toContain("Interest earned");
    expect(text).toContain("Closing balance");
    expect(text).toContain("$15.00");
    unmount();
  });
});
