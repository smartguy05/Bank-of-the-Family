import { useState } from "react";
import { Info, Plus, Target } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { GoalCard } from "@/components/bank/GoalCard";
import { NewGoalDialog } from "@/components/bank/NewGoalDialog";
import { useGoals } from "@/hooks/useGoals";
import { useAccounts } from "@/hooks/useAccounts";
import { useChildren } from "@/hooks/useChildren";
import { useMe } from "@/hooks/useMe";

function KidGoals() {
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: goals, isLoading: goalsLoading } = useGoals();
  const [creating, setCreating] = useState(false);

  const isLoading = accountsLoading || goalsLoading;

  return (
    <div>
      <PageHeader
        title="Goals"
        subtitle="Save up for the things you want"
        actions={
          <Button size="sm" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            New goal
          </Button>
        }
      />

      <Card className="mb-4">
        <CardBody className="flex items-start gap-2.5 text-sm text-muted">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>
            <span className="font-medium text-ink">Available to spend</span> is your account balance
            minus whatever you&rsquo;ve put toward goals — it&rsquo;s always right there when you
            check an account.
          </p>
        </CardBody>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !goals || goals.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target size={28} />}
            title="No goals yet"
            description="Start a goal for something you're saving for, and watch your progress grow."
            action={<Button onClick={() => setCreating(true)}>Start a goal</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              account={accounts?.find((a) => a.id === g.accountId)}
              editable
            />
          ))}
        </div>
      )}

      <NewGoalDialog open={creating} onClose={() => setCreating(false)} accounts={accounts ?? []} />
    </div>
  );
}

function ParentGoals() {
  const { data: children, isLoading: childrenLoading } = useChildren();
  const { data: goals, isLoading: goalsLoading } = useGoals();
  const isLoading = childrenLoading || goalsLoading;

  const childByAccount = new Map<string, { childName: string; accountId: string }>();
  for (const child of children ?? []) {
    for (const acc of child.accounts) {
      childByAccount.set(acc.id, { childName: child.user.displayName, accountId: acc.id });
    }
  }

  const groups = new Map<string, { childName: string; goals: NonNullable<typeof goals> }>();
  for (const goal of goals ?? []) {
    const owner = childByAccount.get(goal.accountId);
    const key = owner?.childName ?? "Unknown";
    if (!groups.has(key)) groups.set(key, { childName: key, goals: [] });
    groups.get(key)!.goals.push(goal);
  }

  return (
    <div>
      <PageHeader title="Goals" subtitle="What each kid is saving toward" />

      <Card className="mb-4">
        <CardBody className="flex items-start gap-2.5 text-sm text-muted">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>
            A kid&rsquo;s <span className="font-medium text-ink">available to spend</span> is their
            account balance minus what they&rsquo;ve earmarked here.
          </p>
        </CardBody>
      </Card>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : groups.size === 0 ? (
        <Card>
          <EmptyState
            icon={<Target size={28} />}
            title="No goals yet"
            description="Kids haven't started any savings goals."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(groups.values()).map((group) => (
            <div key={group.childName}>
              <h2 className="mb-2 text-sm font-semibold text-ink">{group.childName}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {group.goals.map((g) => (
                  <GoalCard key={g.id} goal={g} account={undefined} editable={false} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function GoalsPage() {
  const { data: me } = useMe();
  if (me?.user.role === "parent") return <ParentGoals />;
  return <KidGoals />;
}
