import { useState } from "react";
import type { Account, AllowanceFrequency, AllowanceSchedule } from "@botf/shared";
import { minorToDecimalString } from "@botf/shared";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useFamilyFormat } from "@/hooks/useFamilyFormat";
import { WEEKDAY_NAMES } from "@/lib/dateLabels";
import { useCreateAllowance, useUpdateAllowance } from "@/hooks/useAllowances";

export interface AllowanceDialogProps {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  /** When set, the dialog edits this schedule instead of creating a new one. */
  editing?: AllowanceSchedule | null;
}

function initialState(
  accounts: Account[],
  currencyCode: string,
  editing?: AllowanceSchedule | null,
) {
  return {
    accountId: editing?.accountId ?? accounts[0]?.id ?? "",
    amountRaw: editing ? minorToDecimalString(editing.amountMinor, currencyCode) : "",
    frequency: (editing?.frequency ?? "weekly") as AllowanceFrequency,
    dayOfWeek: editing?.dayOfWeek ?? 0,
    dayOfMonth: editing?.dayOfMonth ?? 1,
    memo: editing?.memo ?? "Allowance",
  };
}

export function AllowanceDialog({ open, onClose, accounts, editing }: AllowanceDialogProps) {
  const { parse, currencyCode } = useFamilyFormat();
  const toast = useToast();
  const createAllowance = useCreateAllowance();
  const updateAllowance = useUpdateAllowance(editing?.id ?? "");
  const [state, setState] = useState(() => initialState(accounts, currencyCode, editing));
  const [amountError, setAmountError] = useState<string | null>(null);

  // Re-seed the form from render (not an effect) whenever the dialog opens or the
  // schedule being edited changes, mirroring EditChildDialog's approach elsewhere.
  const identity = editing?.id ?? "new";
  const [syncedIdentity, setSyncedIdentity] = useState<string | null>(null);
  if (!open && syncedIdentity !== null) {
    setSyncedIdentity(null);
  } else if (open && identity !== syncedIdentity) {
    setSyncedIdentity(identity);
    setState(initialState(accounts, currencyCode, editing));
    setAmountError(null);
  }

  const isEditing = Boolean(editing);
  const pending = createAllowance.isPending || updateAllowance.isPending;

  async function handleSubmit() {
    const amountMinor = parse(state.amountRaw);
    if (amountMinor === null || amountMinor <= 0) {
      setAmountError("Enter a valid amount greater than zero");
      return;
    }
    setAmountError(null);

    const shared = {
      amountMinor,
      frequency: state.frequency,
      memo: state.memo.trim() || "Allowance",
      dayOfWeek: state.frequency === "monthly" ? undefined : state.dayOfWeek,
      dayOfMonth: state.frequency === "monthly" ? state.dayOfMonth : undefined,
    };

    try {
      if (isEditing && editing) {
        await updateAllowance.mutateAsync(shared);
        toast.success("Allowance updated");
      } else {
        await createAllowance.mutateAsync({ ...shared, accountId: state.accountId });
        toast.success("Allowance scheduled");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save allowance");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit allowance" : "Set up allowance"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => void handleSubmit()}>
            {isEditing ? "Save changes" : "Schedule allowance"}
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
        <Field label="Amount" error={amountError ?? undefined} required>
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={state.amountRaw}
            onChange={(e) => setState((s) => ({ ...s, amountRaw: e.target.value }))}
          />
        </Field>
        <Field label="Frequency" required>
          <Select
            value={state.frequency}
            onChange={(e) =>
              setState((s) => ({ ...s, frequency: e.target.value as AllowanceFrequency }))
            }
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
          </Select>
        </Field>
        {state.frequency === "monthly" ? (
          <Field label="Day of month" required hint="1–28, to keep every month valid">
            <Input
              type="number"
              min={1}
              max={28}
              value={state.dayOfMonth}
              onChange={(e) => setState((s) => ({ ...s, dayOfMonth: Number(e.target.value) || 1 }))}
            />
          </Field>
        ) : (
          <Field label="Day of week" required>
            <Select
              value={state.dayOfWeek}
              onChange={(e) => setState((s) => ({ ...s, dayOfWeek: Number(e.target.value) }))}
            >
              {WEEKDAY_NAMES.map((day, i) => (
                <option key={day} value={i}>
                  {day}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Memo">
          <Textarea
            rows={2}
            value={state.memo}
            onChange={(e) => setState((s) => ({ ...s, memo: e.target.value }))}
          />
        </Field>
      </div>
    </Dialog>
  );
}
