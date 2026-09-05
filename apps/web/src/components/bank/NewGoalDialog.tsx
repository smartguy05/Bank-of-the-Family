import { useState } from "react";
import type { Account, SavingsGoal } from "@botf/shared";
import { minorToDecimalString } from "@botf/shared";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useFamilyFormat } from "@/hooks/useFamilyFormat";
import { GOAL_EMOJIS } from "@/lib/goalEmojis";
import { cn } from "@/lib/cn";
import { useCreateGoal, useUpdateGoal } from "@/hooks/useGoals";

export interface NewGoalDialogProps {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  /** When set, edits this goal's details instead of creating a new one. */
  editing?: SavingsGoal | null;
}

function initialState(accounts: Account[], currencyCode: string, editing?: SavingsGoal | null) {
  return {
    accountId: editing?.accountId ?? accounts[0]?.id ?? "",
    name: editing?.name ?? "",
    emoji: editing?.emoji ?? GOAL_EMOJIS[0]!,
    targetRaw: editing ? minorToDecimalString(editing.targetMinor, currencyCode) : "",
    targetDate: editing?.targetDate ?? "",
  };
}

export function NewGoalDialog({ open, onClose, accounts, editing }: NewGoalDialogProps) {
  const { parse, currencyCode } = useFamilyFormat();
  const toast = useToast();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal(editing?.id ?? "");
  const [state, setState] = useState(() => initialState(accounts, currencyCode, editing));
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(editing);
  const pending = createGoal.isPending || updateGoal.isPending;

  // Re-seed the form from render (not an effect) whenever the dialog opens or the
  // goal being edited changes, mirroring EditChildDialog's approach elsewhere.
  const identity = editing?.id ?? "new";
  const [syncedIdentity, setSyncedIdentity] = useState<string | null>(null);
  if (!open && syncedIdentity !== null) {
    setSyncedIdentity(null);
  } else if (open && identity !== syncedIdentity) {
    setSyncedIdentity(identity);
    setState(initialState(accounts, currencyCode, editing));
    setError(null);
  }

  async function handleSubmit() {
    if (!state.name.trim()) {
      setError("Give your goal a name");
      return;
    }
    const targetMinor = parse(state.targetRaw);
    if (targetMinor === null || targetMinor <= 0) {
      setError("Enter a target amount greater than zero");
      return;
    }
    setError(null);

    try {
      if (isEditing && editing) {
        await updateGoal.mutateAsync({
          name: state.name.trim(),
          emoji: state.emoji,
          targetMinor,
          targetDate: state.targetDate || null,
        });
        toast.success("Goal updated");
      } else {
        await createGoal.mutateAsync({
          accountId: state.accountId,
          name: state.name.trim(),
          emoji: state.emoji,
          targetMinor,
          targetDate: state.targetDate || undefined,
        });
        toast.success("Goal created");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save goal");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit goal" : "New goal"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => void handleSubmit()}>
            {isEditing ? "Save changes" : "Create goal"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!isEditing && (
          <Field label="Account" required>
            <Select
              value={state.accountId}
              onChange={(e) => setState((s) => ({ ...s, accountId: e.target.value }))}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type})
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Icon">
          <div className="flex flex-wrap gap-2">
            {GOAL_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setState((s) => ({ ...s, emoji: e }))}
                aria-label={`Choose icon ${e}`}
                aria-pressed={e === state.emoji}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border text-lg",
                  e === state.emoji
                    ? "border-brand-800 bg-brand-50"
                    : "border-line hover:bg-surface",
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Name" error={error ?? undefined} required>
          <Input
            placeholder="New bike"
            value={state.name}
            onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          />
        </Field>
        <Field label="Target amount" required>
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={state.targetRaw}
            onChange={(e) => setState((s) => ({ ...s, targetRaw: e.target.value }))}
          />
        </Field>
        <Field label="Target date (optional)">
          <Input
            type="date"
            value={state.targetDate}
            onChange={(e) => setState((s) => ({ ...s, targetDate: e.target.value }))}
          />
        </Field>
      </div>
    </Dialog>
  );
}
