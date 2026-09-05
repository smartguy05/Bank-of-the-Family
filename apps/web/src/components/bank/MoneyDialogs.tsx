import { useState } from "react";
import type { Account, TransactionCategory } from "@botf/shared";
import { CATEGORY_LABELS, CHARGE_CATEGORIES, DEPOSIT_CATEGORIES } from "@botf/shared";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useFamilyFormat } from "@/hooks/useFamilyFormat";
import { useToast } from "@/components/ui/Toast";
import { useCharge, useDeposit, useTransfer } from "@/hooks/useTransactions";

interface BaseProps {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  defaultAccountId?: string;
}

function useAmountField() {
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
