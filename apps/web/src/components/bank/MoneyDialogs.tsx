import { useState } from "react";
import type { Account, TransactionCategory } from "@botf/shared";
import {
  CATEGORY_LABELS,
  CHARGE_CATEGORIES,
  DEPOSIT_CATEGORIES,
  WITHDRAWAL_CATEGORIES,
} from "@botf/shared";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { useAmountField } from "@/hooks/useAmountField";
import { useToast } from "@/components/ui/Toast";
import { useCharge, useDeposit, useTransfer, useWithdraw } from "@/hooks/useTransactions";

interface BaseProps {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  defaultAccountId?: string;
}

function AccountOption({ account }: { account: Account }) {
  return (
    <option value={account.id}>
      {account.name} ({account.type})
    </option>
  );
}

export function DepositDialog({ open, onClose, accounts, defaultAccountId }: BaseProps) {
  const [chosenAccountId, setAccountId] = useState("");
  const accountId = chosenAccountId || defaultAccountId || accounts[0]?.id || "";
  const [category, setCategory] = useState<TransactionCategory>("allowance");
  const [memo, setMemo] = useState("");
  const amount = useAmountField();
  const deposit = useDeposit();
  const toast = useToast();

  async function handleSubmit() {
    const amountMinor = amount.resolve();
    if (amountMinor === null || !accountId) return;
    try {
      await deposit.mutateAsync({ accountId, amountMinor, category, memo });
      toast.success("Deposit posted");
      onClose();
      setMemo("");
      amount.setRaw("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post deposit");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Deposit money"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={deposit.isPending} onClick={() => void handleSubmit()}>
            Deposit
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Account" required>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <AccountOption key={a.id} account={a} />
            ))}
          </Select>
        </Field>
        <Field label="Amount" error={amount.error ?? undefined} required>
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={amount.raw}
            onChange={(e) => amount.setRaw(e.target.value)}
          />
        </Field>
        <Field label="Category">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as TransactionCategory)}
          >
            {DEPOSIT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Memo (optional)">
          <Textarea
            rows={2}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="e.g. Weekly chores"
          />
        </Field>
      </div>
    </Dialog>
  );
}

export function ChargeDialog({ open, onClose, accounts, defaultAccountId }: BaseProps) {
  const [chosenAccountId, setAccountId] = useState("");
  const accountId = chosenAccountId || defaultAccountId || accounts[0]?.id || "";
  const [category, setCategory] = useState<TransactionCategory>("purchase");
  const [memo, setMemo] = useState("");
  const amount = useAmountField();
  const charge = useCharge();
  const toast = useToast();

  async function handleSubmit() {
    const amountMinor = amount.resolve();
    if (amountMinor === null || !accountId) return;
    try {
      await charge.mutateAsync({ accountId, amountMinor, category, memo });
      toast.success("Charge posted");
      onClose();
      setMemo("");
      amount.setRaw("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post charge");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Charge account"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={charge.isPending} onClick={() => void handleSubmit()}>
            Charge
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Account" required>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <AccountOption key={a.id} account={a} />
            ))}
          </Select>
        </Field>
        <Field label="Amount" error={amount.error ?? undefined} required>
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={amount.raw}
            onChange={(e) => amount.setRaw(e.target.value)}
          />
        </Field>
        <Field label="Category">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as TransactionCategory)}
          >
            {CHARGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Memo (optional)">
          <Textarea
            rows={2}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="What was this for?"
          />
        </Field>
      </div>
    </Dialog>
  );
}

interface WithdrawDialogProps extends BaseProps {
  /** Child's first name, used in the goal-money warning copy. */
  ownerName?: string;
}

export function WithdrawDialog({
  open,
  onClose,
  accounts,
  defaultAccountId,
  ownerName,
}: WithdrawDialogProps) {
  const [chosenAccountId, setAccountId] = useState("");
  const accountId = chosenAccountId || defaultAccountId || accounts[0]?.id || "";
  const [category, setCategory] = useState<TransactionCategory>("cash");
  const [memo, setMemo] = useState("");
  const [confirming, setConfirming] = useState<{
    amountMinor: number;
    overageMinor: number;
  } | null>(null);
  const amount = useAmountField();
  const withdraw = useWithdraw();
  const toast = useToast();

  const selectedAccount = accounts.find((a) => a.id === accountId);

  // Reset the confirmation state whenever the dialog closes or the amount/account changes.
  // (Adjusted during render rather than in an effect, per React's guidance for derived state.)
  const resetKey = `${open ? "open" : "closed"}|${accountId}|${amount.raw}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    if (confirming) setConfirming(null);
  }

  async function post(amountMinor: number) {
    try {
      await withdraw.mutateAsync({ accountId, amountMinor, category, memo });
      toast.success("Withdrawal posted");
      onClose();
      setMemo("");
      amount.setRaw("");
      setConfirming(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post withdrawal");
    }
  }

  async function handleSubmit() {
    const amountMinor = amount.resolve();
    if (amountMinor === null || !accountId) return;
    if (selectedAccount && amountMinor > selectedAccount.availableMinor) {
      setConfirming({ amountMinor, overageMinor: amountMinor - selectedAccount.availableMinor });
      return;
    }
    await post(amountMinor);
  }

  function handleClose() {
    setConfirming(null);
    onClose();
  }

  if (confirming) {
    return (
      <Dialog
        open={open}
        onClose={handleClose}
        title="Withdraw cash"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Go back
            </Button>
            <Button loading={withdraw.isPending} onClick={() => void post(confirming.amountMinor)}>
              Withdraw anyway
            </Button>
          </>
        }
      >
        <div className="rounded-card border border-warning/20 bg-warning/10 p-4 text-sm text-warning">
          <p>
            This dips into money {ownerName ?? "they"} set aside for goals. It takes{" "}
            <Money minor={confirming.overageMinor} className="font-semibold" /> from their goal
            savings. Check with them before handing over the cash.
          </p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Withdraw cash"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button loading={withdraw.isPending} onClick={() => void handleSubmit()}>
            Withdraw
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Account" required>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <AccountOption key={a.id} account={a} />
            ))}
          </Select>
        </Field>
        <Field label="Amount" error={amount.error ?? undefined} required>
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={amount.raw}
            onChange={(e) => amount.setRaw(e.target.value)}
          />
        </Field>
        <Field label="Category">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as TransactionCategory)}
          >
            {WITHDRAWAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Memo (optional)">
          <Textarea
            rows={2}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="e.g. Cash for the book fair"
          />
        </Field>
      </div>
    </Dialog>
  );
}

export function TransferDialog({ open, onClose, accounts, defaultAccountId }: BaseProps) {
  const [chosenFrom, setFromAccountId] = useState("");
  const [chosenTo, setToAccountId] = useState("");
  const fromAccountId = chosenFrom || defaultAccountId || accounts[0]?.id || "";
  const toAccountId = chosenTo || accounts.find((a) => a.id !== fromAccountId)?.id || "";
  const [memo, setMemo] = useState("");
  const amount = useAmountField();
  const transfer = useTransfer();
  const toast = useToast();

  async function handleSubmit() {
    const amountMinor = amount.resolve();
    if (amountMinor === null) return;
    if (!fromAccountId || !toAccountId) return;
    if (fromAccountId === toAccountId) {
      amount.setError("Choose two different accounts");
      return;
    }
    try {
      await transfer.mutateAsync({ fromAccountId, toAccountId, amountMinor, memo });
      toast.success("Transfer complete");
      onClose();
      setMemo("");
      amount.setRaw("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not transfer");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Transfer money"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={transfer.isPending} onClick={() => void handleSubmit()}>
            Transfer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="From" required>
          <Select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
            {accounts.map((a) => (
              <AccountOption key={a.id} account={a} />
            ))}
          </Select>
        </Field>
        <Field label="To" required>
          <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            {accounts.map((a) => (
              <AccountOption key={a.id} account={a} />
            ))}
          </Select>
        </Field>
        <Field label="Amount" error={amount.error ?? undefined} required>
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={amount.raw}
            onChange={(e) => amount.setRaw(e.target.value)}
          />
        </Field>
        <Field label="Memo (optional)">
          <Textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
