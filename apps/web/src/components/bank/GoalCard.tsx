import { useState } from "react";
import dayjs from "dayjs";
import { Pencil, Trash2 } from "lucide-react";
import type { Account, SavingsGoal } from "@botf/shared";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useToast } from "@/components/ui/Toast";
import { useCompleteGoal, useDeleteGoal } from "@/hooks/useGoals";
import { AllocateGoalDialog } from "@/components/bank/AllocateGoalDialog";
import { NewGoalDialog } from "@/components/bank/NewGoalDialog";

type DialogKind = "add" | "take" | "edit" | null;

export interface GoalCardProps {
  goal: SavingsGoal;
  account: Account | undefined;
  /** Kid viewing their own goal: shows Add/Take out/Edit/Delete/Mark as reached. */
  editable: boolean;
  childLabel?: string;
}

export function GoalCard({ goal, account, editable, childLabel }: GoalCardProps) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const deleteGoal = useDeleteGoal();
  const completeGoal = useCompleteGoal(goal.id);
  const toast = useToast();

  const pct = goal.targetMinor > 0 ? (goal.savedMinor / goal.targetMinor) * 100 : 0;
  const reached = goal.savedMinor >= goal.targetMinor;
  const daysLeft = goal.targetDate
    ? dayjs(goal.targetDate).startOf("day").diff(dayjs().startOf("day"), "day")
    : null;

  async function handleComplete() {
    try {
      await completeGoal.mutateAsync();
      toast.success("Nice! Goal marked as reached.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark goal as reached");
    }
  }

  async function handleDelete() {
    try {
      await deleteGoal.mutateAsync(goal.id);
      toast.success("Goal removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove goal");
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xl">
          {goal.emoji ?? "🎯"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-medium text-ink">{goal.name}</p>
            {childLabel && <Badge tone="neutral">{childLabel}</Badge>}
            {goal.completedAt && <Badge tone="positive">Reached</Badge>}
          </div>
          <p className="text-sm text-muted">
            <Money minor={goal.savedMinor} className="font-medium text-ink" /> of{" "}
            <Money minor={goal.targetMinor} />
          </p>
        </div>
      </div>

      <ProgressBar value={pct} className="mt-3" />
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
        <span>{Math.min(100, Math.round(pct))}% saved</span>
        {goal.targetDate &&
          (daysLeft !== null && daysLeft >= 0 ? (
            <span>
              {daysLeft} day{daysLeft === 1 ? "" : "s"} left
            </span>
          ) : (
            <span>Target date passed</span>
          ))}
      </div>

      {editable && !goal.completedAt && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setDialog("add")}>
              Add money
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={goal.savedMinor <= 0}
              onClick={() => setDialog("take")}
            >
              Take out
            </Button>
            {reached && (
              <Button
                size="sm"
                variant="secondary"
                loading={completeGoal.isPending}
                onClick={() => void handleComplete()}
              >
                Mark as reached
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={<Pencil size={14} />}
              aria-label="Edit goal"
              onClick={() => setDialog("edit")}
            />
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 size={14} />}
              aria-label="Delete goal"
              onClick={() => void handleDelete()}
            />
          </div>
          {reached && (
            <p className="mt-2 text-xs text-muted">
              Reaching a goal doesn&rsquo;t spend the money — it stays in the account, and a parent
              can charge the purchase when it&rsquo;s bought.
            </p>
          )}
        </>
      )}
      {editable && goal.completedAt && (
        <div className="mt-4">
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 size={14} />}
            onClick={() => void handleDelete()}
          >
            Remove
          </Button>
        </div>
      )}

      <AllocateGoalDialog
        open={dialog === "add"}
        onClose={() => setDialog(null)}
        goal={goal}
        account={account}
        mode="add"
      />
      <AllocateGoalDialog
        open={dialog === "take"}
        onClose={() => setDialog(null)}
        goal={goal}
        account={account}
        mode="take"
      />
      <NewGoalDialog
        open={dialog === "edit"}
        onClose={() => setDialog(null)}
        accounts={account ? [account] : []}
        editing={goal}
      />
    </Card>
  );
}
