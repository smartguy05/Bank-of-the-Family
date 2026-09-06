import { useState } from "react";
import type { Account } from "@botf/shared";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useFamilyFormat } from "@/hooks/useFamilyFormat";
import { useCreatePeerRequest, usePeers } from "@/hooks/usePeerRequests";

export function RequestFromSiblingDialog({
  open,
  onClose,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
}) {
  const { parse } = useFamilyFormat();
  const { data: peers } = usePeers();
  const toast = useToast();
  const createPeerRequest = useCreatePeerRequest();

  const [payerUserId, setPayerUserId] = useState("");
  const [chosenAccountId, setAccountId] = useState("");
  const requesterAccountId = chosenAccountId || accounts[0]?.id || "";
  const effectivePayerUserId = payerUserId || peers?.[0]?.id || "";
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
      setReasonError("Tell them what it's for");
      ok = false;
    } else {
      setReasonError(null);
    }
    if (!ok || amountMinor === null || !effectivePayerUserId) return;

    try {
      await createPeerRequest.mutateAsync({
        payerUserId: effectivePayerUserId,
        requesterAccountId,
        amountMinor,
        reason: reason.trim(),
      });
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
      title="Request from a sibling"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={createPeerRequest.isPending}
            disabled={!peers?.length}
            onClick={() => void handleSubmit()}
          >
            Send request
          </Button>
        </>
      }
    >
      {peers && peers.length === 0 ? (
        <EmptyState
          title="No one to ask yet"
          description="You need a sibling in your family first."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Ask" required>
            <Select value={effectivePayerUserId} onChange={(e) => setPayerUserId(e.target.value)}>
              {(peers ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Deposit into" required>
            <Select value={requesterAccountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type})
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
              placeholder="e.g. Splitting the gift for Mom"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
