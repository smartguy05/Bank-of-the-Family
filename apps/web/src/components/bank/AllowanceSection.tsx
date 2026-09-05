import { useState } from "react";
import dayjs from "dayjs";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import type { Account, AllowanceSchedule } from "@botf/shared";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { ordinal, WEEKDAY_NAMES } from "@/lib/dateLabels";
import { useAllowances, useDeleteAllowance, useUpdateAllowance } from "@/hooks/useAllowances";
import { AllowanceDialog } from "@/components/bank/AllowanceDialog";

function frequencyLabel(a: AllowanceSchedule): string {
  if (a.frequency === "monthly") return `Monthly on the ${ordinal(a.dayOfMonth ?? 1)}`;
  const freq = a.frequency === "weekly" ? "Weekly" : "Every 2 weeks";
  return `${freq} on ${WEEKDAY_NAMES[a.dayOfWeek ?? 0]}`;
}

function AllowanceRow({
  schedule,
  accountName,
}: {
  schedule: AllowanceSchedule;
  accountName: string;
}) {
  const toast = useToast();
  const updateAllowance = useUpdateAllowance(schedule.id);
  const deleteAllowance = useDeleteAllowance();
  const [editing, setEditing] = useState(false);

  async function toggleActive() {
    try {
      await updateAllowance.mutateAsync({ active: !schedule.active });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update allowance");
    }
  }

  async function handleDelete() {
    try {
      await deleteAllowance.mutateAsync(schedule.id);
      toast.success("Allowance removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove allowance");
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-ink">
              <Money minor={schedule.amountMinor} />
            </p>
            <Badge tone={schedule.active ? "positive" : "neutral"}>
              {schedule.active ? "Active" : "Paused"}
            </Badge>
          </div>
          <p className="text-sm text-muted">
            {frequencyLabel(schedule)} · {accountName}
          </p>
          <p className="text-xs text-muted">
            Next: {dayjs(schedule.nextRunAt).format("MMM D, YYYY")}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => void toggleActive()}>
            {schedule.active ? "Pause" : "Resume"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Pencil size={14} />}
            aria-label="Edit allowance"
            onClick={() => setEditing(true)}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={14} />}
            aria-label="Delete allowance"
            onClick={() => void handleDelete()}
          />
        </div>
      </div>
      <AllowanceDialog
        open={editing}
        onClose={() => setEditing(false)}
        accounts={[]}
        editing={schedule}
      />
    </>
  );
}

export function AllowanceSection({ accounts }: { accounts: Account[] }) {
  const { data: allowances, isLoading } = useAllowances();
  const [creating, setCreating] = useState(false);
  const accountIds = new Set(accounts.map((a) => a.id));
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "Account";
  const schedules = (allowances ?? []).filter((a) => accountIds.has(a.accountId));

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-800">
            <CalendarClock size={18} />
          </div>
          <h2 className="font-semibold text-ink">Allowance</h2>
        </div>
        <Button size="sm" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
          Set up allowance
        </Button>
      </CardHeader>
      <CardBody>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : schedules.length === 0 ? (
          <EmptyState
            title="No allowance scheduled"
            description="Set up a recurring allowance so it pays automatically."
          />
        ) : (
          <div className="divide-y divide-line">
            {schedules.map((s) => (
              <AllowanceRow key={s.id} schedule={s} accountName={accountName(s.accountId)} />
            ))}
          </div>
        )}
      </CardBody>
      <AllowanceDialog open={creating} onClose={() => setCreating(false)} accounts={accounts} />
    </Card>
  );
}
