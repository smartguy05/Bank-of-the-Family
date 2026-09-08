import { afterEach, describe, expect, it, vi } from "vitest";
import type { Account } from "@botf/shared";
import { WithdrawDialog } from "@/components/bank/MoneyDialogs";
import { click, renderToDom, setInputValue } from "@/test/render";

const mutateAsync = vi.fn().mockResolvedValue({ id: "tx_1" });
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("@/hooks/useFamilyFormat", () => ({
  useFamilyFormat: () => ({
    currencyCode: "USD",
    locale: "en-US",
    fmt: (minor: number) => `$${(minor / 100).toFixed(2)}`,
    // "10.00" -> 1000, "90.00" -> 9000, etc. Mirrors dollars.cents input.
    parse: (input: string) => {
      const n = Number(input);
      if (Number.isNaN(n)) return null;
      return Math.round(n * 100);
    },
  }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ success: toastSuccess, error: toastError, info: vi.fn(), show: vi.fn() }),
}));

vi.mock("@/hooks/useTransactions", () => ({
  useWithdraw: () => ({ mutateAsync, isPending: false }),
}));

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc_1",
    familyId: "fam_1",
    ownerUserId: "u_child",
    type: "checking",
    name: "Checking",
    accountNumber: "4821-0093-1207",
    interestRateBps: 0,
    balanceMinor: 10000,
    availableMinor: 8000,
    lastInterestPostedAt: null,
    status: "open",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function buttonByText(root: ParentNode, text: string): HTMLButtonElement {
  const btn = Array.from(root.querySelectorAll("button")).find((b) => b.textContent === text);
  if (!btn) throw new Error(`No button with text "${text}"`);
  return btn as HTMLButtonElement;
}

describe("WithdrawDialog", () => {
  afterEach(() => {
    mutateAsync.mockClear();
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it("submits immediately when the amount is within the available balance", async () => {
    const onClose = vi.fn();
    const account = makeAccount();
    const { unmount } = renderToDom(
      <WithdrawDialog
        open
        onClose={onClose}
        accounts={[account]}
        defaultAccountId={account.id}
        ownerName="Alex"
      />,
    );

    const amountInput = document.body.querySelector<HTMLInputElement>('input[placeholder="0.00"]')!;
    setInputValue(amountInput, "10.00");
    click(buttonByText(document.body, "Withdraw"));
    await Promise.resolve();
    await Promise.resolve();

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: account.id, amountMinor: 1000, category: "cash" }),
    );
    expect(document.body.textContent).not.toContain("dips into money");

    unmount();
  });

  it("shows the goal warning and withholds submission until Withdraw anyway is clicked", async () => {
    const onClose = vi.fn();
    const account = makeAccount();
    const { unmount } = renderToDom(
      <WithdrawDialog
        open
        onClose={onClose}
        accounts={[account]}
        defaultAccountId={account.id}
        ownerName="Alex"
      />,
    );

    const amountInput = document.body.querySelector<HTMLInputElement>('input[placeholder="0.00"]')!;
    setInputValue(amountInput, "90.00");
    click(buttonByText(document.body, "Withdraw"));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Alex");
    expect(document.body.textContent).toContain("dips into money");
    expect(document.body.textContent).toContain("$10.00"); // overage: 9000 - 8000 = 1000

    click(buttonByText(document.body, "Withdraw anyway"));
    await Promise.resolve();
    await Promise.resolve();

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: account.id, amountMinor: 9000, category: "cash" }),
    );

    unmount();
  });

  it("returns to the form and keeps the entered amount when Go back is clicked", () => {
    const onClose = vi.fn();
    const account = makeAccount();
    const { unmount } = renderToDom(
      <WithdrawDialog
        open
        onClose={onClose}
        accounts={[account]}
        defaultAccountId={account.id}
        ownerName="Alex"
      />,
    );

    const amountInput = document.body.querySelector<HTMLInputElement>('input[placeholder="0.00"]')!;
    setInputValue(amountInput, "90.00");
    click(buttonByText(document.body, "Withdraw"));

    expect(document.body.textContent).toContain("dips into money");

    click(buttonByText(document.body, "Go back"));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("dips into money");
    const restoredInput = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="0.00"]',
    )!;
    expect(restoredInput.value).toBe("90.00");

    unmount();
  });
});
