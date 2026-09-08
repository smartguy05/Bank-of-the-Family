import { describe, expect, it, vi } from "vitest";
import type { Transaction } from "@botf/shared";
import { TransactionRow } from "@/components/bank/TransactionRow";
import { renderToDom } from "@/test/render";

vi.mock("@/hooks/useFamilyFormat", () => ({
  useFamilyFormat: () => ({
    currencyCode: "USD",
    locale: "en-US",
    fmt: (minor: number, opts?: { signDisplay?: string }) => {
      const sign = minor > 0 && opts?.signDisplay === "exceptZero" ? "+" : minor < 0 ? "-" : "";
      return `${sign}$${Math.abs(minor / 100).toFixed(2)}`;
    },
    parse: () => null,
  }),
}));

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: "tx_1234567890",
    familyId: "fam_1",
    accountId: "acc_1",
    kind: "deposit",
    category: "allowance",
    amountMinor: 500,
    runningBalanceMinor: 1500,
    memo: "",
    createdByUserId: "u_1",
    createdByName: "Mom",
    relatedTransactionId: null,
    counterpartyAccountId: null,
    counterpartyAccountName: null,
    reversedByTransactionId: null,
    postedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("TransactionRow", () => {
  it("renders a credit with a positive sign", () => {
    const { container, unmount } = renderToDom(
      <TransactionRow transaction={makeTransaction({ amountMinor: 500, kind: "deposit" })} />,
    );
    expect(container.textContent).toContain("+$5.00");
    unmount();
  });

  it("renders a debit with a negative amount", () => {
    const { container, unmount } = renderToDom(
      <TransactionRow
        transaction={makeTransaction({ amountMinor: -300, kind: "charge", category: "purchase" })}
      />,
    );
    expect(container.textContent).toContain("-$3.00");
    unmount();
  });

  it("renders a withdrawal as a debit with the Withdrawal category label", () => {
    const { container, unmount } = renderToDom(
      <TransactionRow
        transaction={makeTransaction({ amountMinor: -1500, kind: "withdrawal", category: "cash" })}
      />,
    );
    expect(container.textContent).toContain("-$15.00");
    expect(container.textContent).toContain("Cash");
    const iconWrapper = container.querySelector("button > div");
    expect(iconWrapper?.className).toContain("bg-brand-100");
    unmount();
  });

  it("shows a Reversed badge when the transaction was reversed", () => {
    const { container, unmount } = renderToDom(
      <TransactionRow
        transaction={makeTransaction({ reversedByTransactionId: "tx_reversal_1" })}
      />,
    );
    expect(container.textContent).toContain("Reversed");
    unmount();
  });

  it("calls onClick with the transaction", () => {
    const onClick = vi.fn();
    const tx = makeTransaction({});
    const { container, unmount } = renderToDom(
      <TransactionRow transaction={tx} onClick={onClick} />,
    );
    container.querySelector("button")!.click();
    expect(onClick).toHaveBeenCalledWith(tx);
    unmount();
  });
});
