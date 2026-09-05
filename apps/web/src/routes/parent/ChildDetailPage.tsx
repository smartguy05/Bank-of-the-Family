import { useState } from "react";
import { CalendarClock, KeyRound, PenSquare, PiggyBank, Plus } from "lucide-react";
import { childDetailRoute } from "@/router";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Avatar";
import { Money } from "@/components/ui/Money";
import { AccountTile } from "@/components/bank/AccountTile";
import { DepositDialog, ChargeDialog, TransferDialog } from "@/components/bank/MoneyDialogs";
import { EditChildDialog } from "@/components/bank/EditChildDialog";
import { ResetPinDialog } from "@/components/bank/ResetPinDialog";
import { AddAccountDialog } from "@/components/bank/AddAccountDialog";
import { useChild } from "@/hooks/useChildren";
import { useAccounts } from "@/hooks/useAccounts";

type DialogKind = "deposit" | "charge" | "transfer" | "edit" | "resetPin" | "addAccount" | null;

export function ChildDetailPage() {
  const { childId } = childDetailRoute.useParams();
  const { data: child, isLoading } = useChild(childId);
  const { data: allAccounts } = useAccounts();
  const [dialog, setDialog] = useState<DialogKind>(null);

  if (isLoading || !child) {
    return (
      <div>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="mt-4 h-32 w-full" />
      </div>
    );
  }

  const familyAccounts = allAccounts ?? child.accounts;

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

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <CardBody className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-800">
              <CalendarClock size={18} />
            </div>
            <div>
              <p className="font-medium text-ink">Allowance</p>
              <p className="text-sm text-muted">
                Scheduled allowances are coming in a future update.
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-accent-600">
              <PiggyBank size={18} />
            </div>
            <div>
              <p className="font-medium text-ink">Interest</p>
              <p className="text-sm text-muted">
                Automatic monthly interest posting is coming in a future update.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      <DepositDialog
        open={dialog === "deposit"}
        onClose={() => setDialog(null)}
        accounts={child.accounts}
        defaultAccountId={child.accounts[0]?.id}
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
