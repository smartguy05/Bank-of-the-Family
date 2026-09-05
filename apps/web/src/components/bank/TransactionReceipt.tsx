import type { ReactNode } from "react";
import { useState } from "react";
import dayjs from "dayjs";
import type { Transaction } from "@botf/shared";
import { CATEGORY_LABELS, KIND_LABELS } from "@botf/shared";
import { Dialog } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { Textarea } from "@/components/ui/Textarea";
import { Field } from "@/components/ui/Field";
import { useReverse } from "@/hooks/useTransactions";
import { useToast } from "@/components/ui/Toast";

export interface TransactionReceiptProps {
  transaction: Transaction | null;
  onClose: () => void;
  /** Show the Reverse action (parents only). */
  canReverse?: boolean;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

export function TransactionReceipt({ transaction, onClose, canReverse }: TransactionReceiptProps) {
  const [confirmingReverse, setConfirmingReverse] = useState(false);
  const [reverseMemo, setReverseMemo] = useState("");
  const reverse = useReverse();
  const toast = useToast();

  if (!transaction) return null;

  const alreadyReversed = Boolean(transaction.reversedByTransactionId);
  const isReversal = transaction.kind === "reversal";
  const reference = transaction.id.slice(0, 8).toUpperCase();

  async function handleReverse() {
    if (!transaction) return;
    try {
      await reverse.mutateAsync({ transactionId: transaction.id, memo: reverseMemo });
      toast.success("Transaction reversed");
      setConfirmingReverse(false);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reverse transaction");
    }
  }

  return (
    <Dialog
      open={Boolean(transaction)}
      onClose={onClose}
      title="Receipt"
      description={`Reference ${reference}`}
    >
      <div className="flex flex-col items-center gap-1 border-b border-line pb-4 text-center">
        <p className="text-3xl font-semibold tabular">
          <Money minor={transaction.amountMinor} signColor signDisplay="exceptZero" />
        </p>
        <p className="text-sm text-muted">
          {transaction.memo || CATEGORY_LABELS[transaction.category]}
        </p>
        <div className="mt-1 flex gap-1.5">
          {alreadyReversed && <Badge tone="warning">Reversed</Badge>}
          {isReversal && <Badge tone="neutral">Reversal</Badge>}
        </div>
      </div>
      <div className="divide-y divide-line">
        <Row label="Posted" value={dayjs(transaction.postedAt).format("MMM D, YYYY · h:mm A")} />
        <Row label="Type" value={KIND_LABELS[transaction.kind]} />
        <Row label="Category" value={CATEGORY_LABELS[transaction.category]} />
        {transaction.counterpartyAccountName && (
          <Row
            label={transaction.amountMinor < 0 ? "To" : "From"}
            value={transaction.counterpartyAccountName}
          />
        )}
        {transaction.createdByName && <Row label="By" value={transaction.createdByName} />}
        <Row label="Balance after" value={<Money minor={transaction.runningBalanceMinor} />} />
      </div>

      {canReverse && !alreadyReversed && !isReversal && (
        <div className="mt-4 border-t border-line pt-4">
          {!confirmingReverse ? (
            <Button variant="danger" size="sm" onClick={() => setConfirmingReverse(true)}>
              Reverse transaction
            </Button>
          ) : (
            <div className="space-y-3">
              <Field label="Reason (optional)">
                <Textarea
                  value={reverseMemo}
                  onChange={(e) => setReverseMemo(e.target.value)}
                  placeholder="Why is this being reversed?"
                  rows={2}
                />
              </Field>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  loading={reverse.isPending}
                  onClick={() => void handleReverse()}
                >
                  Confirm reverse
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingReverse(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
