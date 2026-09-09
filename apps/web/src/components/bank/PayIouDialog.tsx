import { useState } from "react";
import type { Account, Iou } from "@botf/shared";
import { minorToDecimalString } from "@botf/shared";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { useFamilyFormat } from "@/hooks/useFamilyFormat";
import { usePayIou } from "@/hooks/useIous";

export interface PayIouDialogProps {
  iou: Iou | null;
  /** The debtor's own accounts — safe to show here since payment is from the debtor's side. */
  accounts: Account[];
  onClose: () => void;
}

export function PayIouDialog({ iou, accounts, onClose }: PayIouDialogProps) {
  const { currencyCode, fmt, parse } = useFamilyFormat();
  const payIou = usePayIou();
  const toast = useToast();

  const [chosenFromAccountId, setFromAccountId] = useState("");
  const fromAccountId = chosenFromAccountId || accounts[0]?.id || "";
  const [raw, setRaw] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);

  // Re-seed the amount from render (not an effect) whenever the IOU being paid changes,
  // mirroring WithdrawDialog's derived-state reset elsewhere.
  const identity = iou?.id ?? null;
  const [syncedIdentity, setSyncedIdentity] = useState<string | null>(null);
  if (identity !== syncedIdentity) {
    setSyncedIdentity(identity);
    setRaw(iou ? minorToDecimalString(iou.remainingMinor, currencyCode) : "");
    setFromAccountId("");
    setAmountError(null);
  }

  if (!iou) return null;

  async function handleSubmit() {
    if (!iou) return;
    const amountMinor = parse(raw);
    if (amountMinor === null || amountMinor <= 0) {
      setAmountError("Enter a valid amount greater than zero");
      return;
    }
    if (amountMinor > iou.remainingMinor) {
      setAmountError("That's more than what's left");
      return;
    }
    setAmountError(null);
    try {
      const result = await payIou.mutateAsync({ id: iou.id, fromAccountId, amountMinor });
      toast.success(result.status === "settled" ? "IOU settled" : "Payment made");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not make payment");
    }
  }

  return (
    <Dialog
      open={Boolean(iou)}
      onClose={onClose}
      title="Pay IOU"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={payIou.isPending}
            disabled={!fromAccountId}
            onClick={() => void handleSubmit()}
          >
            Pay
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-surface p-3 text-sm">
          <p className="font-medium text-ink">
            {iou.debtorName} → {iou.creditorName}
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular text-ink">
            <Money minor={iou.remainingMinor} />
          </p>
          <p className="mt-0.5 text-muted">{iou.reason}</p>
        </div>
        <Field label="Pay from" required>
          <Select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.type}) · {fmt(a.availableMinor)} available
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" error={amountError ?? undefined} required>
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
