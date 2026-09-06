import { useState } from "react";
import type { Account, PeerRequest } from "@botf/shared";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { useApprovePeerRequest, useDeclinePeerRequest } from "@/hooks/usePeerRequests";

export function DecidePeerRequestDialog({
  request,
  action,
  accounts,
  onClose,
}: {
  request: PeerRequest | null;
  action: "approve" | "decline";
  /** The payer's own accounts — safe to show here since the viewer is the payer. */
  accounts: Account[];
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [chosenFromAccountId, setFromAccountId] = useState("");
  const fromAccountId = chosenFromAccountId || accounts[0]?.id || "";
  const approve = useApprovePeerRequest();
  const decline = useDeclinePeerRequest();
  const toast = useToast();
  const pending = approve.isPending || decline.isPending;

  if (!request) return null;

  async function handleConfirm() {
    if (!request) return;
    try {
      if (action === "approve") {
        if (!fromAccountId) return;
        await approve.mutateAsync({ id: request.id, fromAccountId, note });
        toast.success(`Approved — ${request.requesterName}'s account was credited`);
      } else {
        await decline.mutateAsync({ id: request.id, note });
        toast.info("Request declined");
      }
      setNote("");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your decision");
    }
  }

  return (
    <Dialog
      open={Boolean(request)}
      onClose={onClose}
      title={action === "approve" ? "Approve request" : "Decline request"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={action === "decline" ? "danger" : "primary"}
            loading={pending}
            disabled={action === "approve" && !fromAccountId}
            onClick={() => void handleConfirm()}
          >
            {action === "approve" ? "Approve" : "Decline"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-surface p-3 text-sm">
          <p className="font-medium text-ink">
            {request.requesterName} · <Money minor={request.amountMinor} />
          </p>
          <p className="mt-0.5 text-muted">{request.reason}</p>
        </div>
        {action === "approve" && (
          <Field label="Pay from" required>
            <Select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type})
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Note (optional)">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={action === "approve" ? "e.g. Here you go!" : "Let them know why"}
          />
        </Field>
      </div>
    </Dialog>
  );
}
