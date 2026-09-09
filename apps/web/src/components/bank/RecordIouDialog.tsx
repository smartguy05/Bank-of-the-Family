import type { ReactNode } from "react";
import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useAmountField } from "@/hooks/useAmountField";
import { useCreateIou } from "@/hooks/useIous";
import { usePeers } from "@/hooks/usePeerRequests";
import { useChildren } from "@/hooks/useChildren";
import { cn } from "@/lib/cn";

type Owed = "iOwe" | "owesMe";

export interface RecordIouDialogProps {
  open: boolean;
  onClose: () => void;
  mode: "kid" | "parent";
  /** Required in kid mode — the signed-in kid's own user id. */
  meUserId?: string;
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md py-2 text-sm font-medium transition-colors",
        active ? "bg-brand-800 text-white" : "text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function RecordIouDialog({ open, onClose, mode, meUserId }: RecordIouDialogProps) {
  // Peers are what a kid picks from; the children list is parent-only, so only fetch the one we need.
  const { data: peers } = usePeers(mode === "kid");
  const { data: children } = useChildren(mode === "parent");
  const toast = useToast();
  const createIou = useCreateIou();

  const [owed, setOwed] = useState<Owed>("iOwe");
  const [siblingId, setSiblingId] = useState("");
  const effectiveSiblingId = siblingId || peers?.[0]?.id || "";

  const [whoOwesId, setWhoOwesId] = useState("");
  const [owedToId, setOwedToId] = useState("");
  const effectiveWhoOwesId = whoOwesId || children?.[0]?.user.id || "";
  const effectiveOwedToId = owedToId || children?.[1]?.user.id || children?.[0]?.user.id || "";

  const amount = useAmountField();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function reset() {
    setOwed("iOwe");
    setSiblingId("");
    setWhoOwesId("");
    setOwedToId("");
    amount.setRaw("");
    setReason("");
    setReasonError(null);
    setDueDate("");
    setFormError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    const amountMinor = amount.resolve();
    let ok = amountMinor !== null;
    if (!reason.trim()) {
      setReasonError("Say what it's for");
      ok = false;
    } else {
      setReasonError(null);
    }

    let debtorUserId: string;
    let creditorUserId: string;
    if (mode === "kid") {
      if (!meUserId || !effectiveSiblingId) return;
      debtorUserId = owed === "iOwe" ? meUserId : effectiveSiblingId;
      creditorUserId = owed === "iOwe" ? effectiveSiblingId : meUserId;
      setFormError(null);
    } else {
      if (!effectiveWhoOwesId || !effectiveOwedToId) return;
      if (effectiveWhoOwesId === effectiveOwedToId) {
        setFormError("Pick two different kids");
        ok = false;
      } else {
        setFormError(null);
      }
      debtorUserId = effectiveWhoOwesId;
      creditorUserId = effectiveOwedToId;
    }

    if (!ok || amountMinor === null) return;

    try {
      const result = await createIou.mutateAsync({
        debtorUserId,
        creditorUserId,
        amountMinor,
        reason: reason.trim(),
        dueDate: dueDate || undefined,
      });
      if (result.status === "pending_acceptance") {
        toast.success(`IOU sent — ${result.debtorName} needs to accept it`);
      } else {
        toast.success("IOU recorded");
      }
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record the IOU");
    }
  }

  const noSiblings = mode === "kid" && peers && peers.length === 0;
  const notEnoughKids = mode === "parent" && children && children.length < 2;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Record an IOU"
      footer={
        !noSiblings &&
        !notEnoughKids && (
          <>
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button loading={createIou.isPending} onClick={() => void handleSubmit()}>
              Record IOU
            </Button>
          </>
        )
      }
    >
      {noSiblings ? (
        <EmptyState
          title="No siblings yet"
          description="You need a sibling in your family first."
        />
      ) : notEnoughKids ? (
        <EmptyState
          title="Need two kids"
          description="Add another child to the family to record an IOU between them."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {mode === "kid" ? (
            <>
              <Field label="Kind of IOU">
                <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
                  <ToggleButton active={owed === "iOwe"} onClick={() => setOwed("iOwe")}>
                    I owe
                  </ToggleButton>
                  <ToggleButton active={owed === "owesMe"} onClick={() => setOwed("owesMe")}>
                    Owes me
                  </ToggleButton>
                </div>
              </Field>
              <Field label="Sibling" required>
                <Select value={effectiveSiblingId} onChange={(e) => setSiblingId(e.target.value)}>
                  {(peers ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          ) : (
            <>
              <Field label="Who owes" error={formError ?? undefined} required>
                <Select value={effectiveWhoOwesId} onChange={(e) => setWhoOwesId(e.target.value)}>
                  {(children ?? []).map((c) => (
                    <option key={c.user.id} value={c.user.id}>
                      {c.user.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Owed to" required>
                <Select value={effectiveOwedToId} onChange={(e) => setOwedToId(e.target.value)}>
                  {(children ?? []).map((c) => (
                    <option key={c.user.id} value={c.user.id}>
                      {c.user.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          <Field label="Amount" error={amount.error ?? undefined} required>
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={amount.raw}
              onChange={(e) => amount.setRaw(e.target.value)}
            />
          </Field>
          <Field label="What's it for?" error={reasonError ?? undefined} required>
            <Textarea
              rows={3}
              maxLength={200}
              placeholder="e.g. Covered the arcade tokens"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Field label="Due date (optional)">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
