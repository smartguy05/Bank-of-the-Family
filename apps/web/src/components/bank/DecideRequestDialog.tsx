import { useState } from "react";
import type { MoneyRequest } from "@botf/shared";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { useApproveRequest, useDeclineRequest } from "@/hooks/useRequests";

export function DecideRequestDialog({
  request,
  action,
  onClose,
}: {
  request: MoneyRequest | null;
  action: "approve" | "decline";
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const approve = useApproveRequest();
  const decline = useDeclineRequest();
  const toast = useToast();
  const pending = approve.isPending || decline.isPending;

  if (!request) return null;

  async function handleConfirm() {
    if (!request) return;
    try {
      if (action === "approve") {
        await approve.mutateAsync({ id: request.id, note });
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
          <p className="mt-0.5 text-xs text-muted">To {request.accountName}</p>
        </div>
        <Field label="Note (optional)">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={action === "approve" ? "e.g. Great job saving up!" : "Let them know why"}
          />
        </Field>
      </div>
    </Dialog>
  );
}
