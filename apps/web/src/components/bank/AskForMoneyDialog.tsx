import { useState } from "react";
import type { Account } from "@botf/shared";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useFamilyFormat } from "@/hooks/useFamilyFormat";
import { useCreateRequest } from "@/hooks/useRequests";

export function AskForMoneyDialog({
  open,
  onClose,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
}) {
  const { parse, fmt } = useFamilyFormat();
  const toast = useToast();
  const createRequest = useCreateRequest();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [raw, setRaw] = useState("");
  const [reason, setReason] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);

  async function handleSubmit() {
    const amountMinor = parse(raw);
    let ok = true;
    if (amountMinor === null || amountMinor <= 0) {
      setAmountError("Enter a valid amount greater than zero");
      ok = false;
    } else {
      setAmountError(null);
    }
    if (!reason.trim()) {
      setReasonError("Tell your parent what it's for");
      ok = false;
    } else {
      setReasonError(null);
    }
    if (!ok || amountMinor === null) return;

    try {
      await createRequest.mutateAsync({ accountId, amountMinor, reason: reason.trim() });
      toast.success("Request sent");
      setRaw("");
      setReason("");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send request");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Ask for money"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={createRequest.isPending} onClick={() => void handleSubmit()}>
            Send request
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Account" required>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {fmt(a.balanceMinor)} available
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
        <Field label="What's it for?" error={reasonError ?? undefined} required>
          <Textarea
            rows={3}
            placeholder="e.g. New soccer cleats"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
