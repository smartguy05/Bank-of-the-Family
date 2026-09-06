import { useState } from "react";
import type { Account } from "@botf/shared";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAmountField } from "@/hooks/useAmountField";
import { useToast } from "@/components/ui/Toast";
import { useSendMoney } from "@/hooks/useTransactions";
import { usePeers } from "@/hooks/usePeerRequests";

export function SendMoneyDialog({
  open,
  onClose,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
}) {
  const { data: peers } = usePeers();
  const [chosenFrom, setFromAccountId] = useState("");
  const fromAccountId = chosenFrom || accounts[0]?.id || "";
  const [toUserId, setToUserId] = useState("");
  const [memo, setMemo] = useState("");
  const amount = useAmountField();
  const sendMoney = useSendMoney();
  const toast = useToast();

  const effectiveToUserId = toUserId || peers?.[0]?.id || "";

  async function handleSubmit() {
    const amountMinor = amount.resolve();
    if (amountMinor === null) return;
    if (!fromAccountId || !effectiveToUserId) return;
    try {
      await sendMoney.mutateAsync({
        fromAccountId,
        toUserId: effectiveToUserId,
        amountMinor,
        memo,
      });
      toast.success("Money sent");
      onClose();
      setMemo("");
      amount.setRaw("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send money");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Send money"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={sendMoney.isPending}
            disabled={!peers?.length}
            onClick={() => void handleSubmit()}
          >
            Send
          </Button>
        </>
      }
    >
      {peers && peers.length === 0 ? (
        <EmptyState
          title="No one to send to yet"
          description="You need a sibling in your family first."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="From" required>
            <Select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To" required>
            <Select value={effectiveToUserId} onChange={(e) => setToUserId(e.target.value)}>
              {(peers ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
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
      )}
    </Dialog>
  );
}
