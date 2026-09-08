import { useMemo, useState } from "react";
import { Inbox, KeyRound, PenSquare, Plus, Target } from "lucide-react";
import { childDetailRoute } from "@/router";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Avatar";
import { Money } from "@/components/ui/Money";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccountTile } from "@/components/bank/AccountTile";
import {
  DepositDialog,
  ChargeDialog,
  TransferDialog,
  WithdrawDialog,
} from "@/components/bank/MoneyDialogs";
import { EditChildDialog } from "@/components/bank/EditChildDialog";
import { ResetPinDialog } from "@/components/bank/ResetPinDialog";
import { AddAccountDialog } from "@/components/bank/AddAccountDialog";
import { AllowanceSection } from "@/components/bank/AllowanceSection";
import { InterestCard } from "@/components/bank/InterestCard";
import { GoalCard } from "@/components/bank/GoalCard";
import { RequestCard } from "@/components/bank/RequestCard";
import { DecideRequestDialog } from "@/components/bank/DecideRequestDialog";
import { useChild } from "@/hooks/useChildren";
import { useAccounts } from "@/hooks/useAccounts";
import { useGoals } from "@/hooks/useGoals";
import { useRequests } from "@/hooks/useRequests";
import type { MoneyRequest } from "@botf/shared";

type DialogKind =
  "deposit" | "withdraw" | "charge" | "transfer" | "edit" | "resetPin" | "addAccount" | null;

export function ChildDetailPage() {
  const { childId } = childDetailRoute.useParams();
  const { data: child, isLoading } = useChild(childId);
  const { data: allAccounts } = useAccounts();
  const { data: goals, isLoading: goalsLoading } = useGoals();
  const pendingRequestsQuery = useRequests("pending");
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [decision, setDecision] = useState<{
    request: MoneyRequest;
    action: "approve" | "decline";
  } | null>(null);

  const childGoals = useMemo(
    () => (goals ?? []).filter((g) => child?.accounts.some((a) => a.id === g.accountId)),
    [goals, child],
  );
  const childPendingRequests = useMemo(
    () =>
      (pendingRequestsQuery.data?.pages.flatMap((p) => p.items) ?? []).filter(
        (r) => r.requesterUserId === childId,
      ),
    [pendingRequestsQuery.data, childId],
  );

  if (isLoading || !child) {
    return (
      <div>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="mt-4 h-32 w-full" />
      </div>
    );
  }

  const familyAccounts = allAccounts ?? child.accounts;
  const savingsAccounts = child.accounts.filter((a) => a.type === "savings");

  return (
    <div>
      <PageHeader
        title={child.user.displayName}
        subtitle={`@${child.user.username}`}
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<PenSquare size={16} />}
            onClick={() => setDialog("edit")}
          >
            Edit
          </Button>
        }
      />

      <div className="flex items-center gap-3 rounded-card border border-line bg-card p-4">
        <Avatar
          name={child.user.displayName}
          color={child.user.avatarColor}
          emoji={child.user.avatarEmoji}
          size="lg"
        />
        <div className="flex-1">
          <p className="text-2xl font-semibold tabular text-ink">
            <Money minor={child.totalMinor} />
          </p>
          <p className="text-sm text-muted">Total across {child.accounts.length} account(s)</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<KeyRound size={16} />}
          onClick={() => setDialog("resetPin")}
        >
          Reset PIN
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => setDialog("deposit")}>Deposit</Button>
        <Button variant="secondary" onClick={() => setDialog("withdraw")}>
          Withdraw
        </Button>
        <Button variant="secondary" onClick={() => setDialog("charge")}>
          Charge
        </Button>
        <Button variant="secondary" onClick={() => setDialog("transfer")}>
          Transfer
        </Button>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Accounts</h2>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={16} />}
            onClick={() => setDialog("addAccount")}
          >
            Add account
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {child.accounts.map((a) => (
            <AccountTile key={a.id} account={a} />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <AllowanceSection accounts={child.accounts} />
      </div>

      {savingsAccounts.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {savingsAccounts.map((a) => (
            <InterestCard key={a.id} account={a} />
          ))}
        </div>
      )}

      <div className="mt-6">
        <Card>
          <CardHeader className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-accent-600">
              <Target size={18} />
            </div>
            <h2 className="font-semibold text-ink">Goals</h2>
          </CardHeader>
          <CardBody>
            {goalsLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : childGoals.length === 0 ? (
              <EmptyState
                title="No goals yet"
                description={`${child.user.displayName} hasn't started a savings goal.`}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {childGoals.map((g) => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    account={child.accounts.find((a) => a.id === g.accountId)}
                    editable={false}
                  />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/10 text-warning">
              <Inbox size={18} />
            </div>
            <h2 className="font-semibold text-ink">Pending requests</h2>
          </CardHeader>
          <CardBody className="px-4 py-1">
            {pendingRequestsQuery.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : childPendingRequests.length === 0 ? (
              <EmptyState title="Nothing pending" />
            ) : (
              <div className="divide-y divide-line">
                {childPendingRequests.map((r) => (
                  <RequestCard
                    key={r.id}
                    request={r}
                    onApprove={(req) => setDecision({ request: req, action: "approve" })}
                    onDecline={(req) => setDecision({ request: req, action: "decline" })}
                  />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <DecideRequestDialog
        request={decision?.request ?? null}
        action={decision?.action ?? "approve"}
        onClose={() => setDecision(null)}
      />

      <DepositDialog
        open={dialog === "deposit"}
        onClose={() => setDialog(null)}
        accounts={child.accounts}
        defaultAccountId={child.accounts[0]?.id}
      />
      <WithdrawDialog
        open={dialog === "withdraw"}
        onClose={() => setDialog(null)}
        accounts={child.accounts}
        defaultAccountId={child.accounts[0]?.id}
        ownerName={child.user.displayName.split(" ")[0]}
      />
      <ChargeDialog
        open={dialog === "charge"}
        onClose={() => setDialog(null)}
        accounts={child.accounts}
        defaultAccountId={child.accounts[0]?.id}
      />
      <TransferDialog
        open={dialog === "transfer"}
        onClose={() => setDialog(null)}
        accounts={familyAccounts}
        defaultAccountId={child.accounts[0]?.id}
      />
      <EditChildDialog child={dialog === "edit" ? child : null} onClose={() => setDialog(null)} />
      <ResetPinDialog
        child={dialog === "resetPin" ? child : null}
        onClose={() => setDialog(null)}
      />
      <AddAccountDialog
        open={dialog === "addAccount"}
        onClose={() => setDialog(null)}
        ownerUserId={child.user.id}
      />
    </div>
  );
}
