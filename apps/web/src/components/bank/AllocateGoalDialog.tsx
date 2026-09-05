import { useState } from "react";
import type { Account, SavingsGoal } from "@botf/shared";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { useFamilyFormat } from "@/hooks/useFamilyFormat";
import { useAllocateGoal } from "@/hooks/useGoals";
import { ApiError } from "@/lib/api";

export interface AllocateGoalDialogProps {
  open: boolean;
  onClose: () => void;
  goal: SavingsGoal | null;
  account: Account | undefined;
  mode: "add" | "take";
}

export function AllocateGoalDialog({
  open,
  onClose,
  goal,
  account,
  mode,
}: AllocateGoalDialogProps) {
  const { parse } = useFamilyFormat();
  const toast = useToast();
  const allocate = useAllocateGoal(goal?.id ?? "");
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form from render (not an effect) whenever the dialog opens, mirroring
  // EditChildDialog's approach elsewhere.
  const identity = `${goal?.id ?? ""}:${mode}`;
  const [syncedIdentity, setSyncedIdentity] = useState<string | null>(null);
  if (!open && syncedIdentity !== null) {
    setSyncedIdentity(null);
  } else if (open && identity !== syncedIdentity) {
    setSyncedIdentity(identity);
    setRaw("");
    setError(null);
  }

  if (!goal) return null;

  const limit = mode === "add" ? (account?.availableMinor ?? 0) : goal.savedMinor;

  async function handleSubmit() {
    const amountMinor = parse(raw);
    if (amountMinor === null || amountMinor <= 0) {
      setError("Enter a valid amount greater than zero");
      return;
    }
    if (amountMinor > limit) {
      setError(
        mode === "add"
          ? "That's more than you have available to spend"
          : "That's more than is saved toward this goal",
      );
      return;
    }
    setError(null);
    try {
      await allocate.mutateAsync({ amountMinor: mode === "add" ? amountMinor : -amountMinor });
      toast.success(
        mode === "add" ? "Money added to your goal" : "Money moved back to your account",
      );
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "INSUFFICIENT_FUNDS") {
        setError("That's more than you have available");
      } else {
        toast.error(err instanceof Error ? err.message : "Could not update goal");
      }
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === "add" ? `Add money to ${goal.name}` : `Take money out of ${goal.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={allocate.isPending} onClick={() => void handleSubmit()}>
            {mode === "add" ? "Add money" : "Take out"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Amount"
          error={error ?? undefined}
          hint={
            mode === "add"
              ? "Up to what's available to spend in the account"
              : "Up to what's saved toward this goal"
          }
          required
        >
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            autoFocus
          />
        </Field>
        <p className="text-sm text-muted">
          {mode === "add" ? "Available to spend" : "Currently saved"}:{" "}
          <Money minor={limit} className="font-medium text-ink" />
        </p>
      </div>
    </Dialog>
  );
}
