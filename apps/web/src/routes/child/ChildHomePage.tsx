import { Link } from "@tanstack/react-router";
import { ChevronRight, Inbox, Target } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Money } from "@/components/ui/Money";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { AccountTile } from "@/components/bank/AccountTile";
import { TransactionList } from "@/components/bank/TransactionList";
import { useChildDashboard } from "@/hooks/useDashboard";
import { useGoals } from "@/hooks/useGoals";
import { useMe } from "@/hooks/useMe";

export function ChildHomePage() {
  const { data: me } = useMe();
  const { data, isLoading } = useChildDashboard();
  const { data: goals } = useGoals();
  const activeGoals = (goals ?? []).filter((g) => !g.completedAt).slice(0, 3);

  return (
    <div>
      <PageHeader
        title={`Hi, ${me?.user.displayName?.split(" ")[0] ?? "there"}`}
        subtitle="Here's what's happening with your money"
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : data ? (
        <div className="flex flex-col gap-5">
          <div className="rounded-card bg-gradient-to-br from-brand-900 to-brand-700 p-6 text-white shadow-md">
            <p className="text-sm text-brand-100">Total balance</p>
            <p className="mt-1 text-4xl font-semibold tabular">
              <Money minor={data.totalMinor} />
            </p>
          </div>

          {data.pendingRequestCount > 0 && (
            <Link to="/requests">
              <Card className="flex items-center gap-3 p-4 transition-shadow hover:shadow-md">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/10 text-warning">
                  <Inbox size={18} />
                </div>
                <p className="flex-1 text-sm font-medium text-ink">
                  {data.pendingRequestCount} request{data.pendingRequestCount === 1 ? "" : "s"}{" "}
                  waiting on a parent
                </p>
                <ChevronRight size={18} className="text-muted" />
              </Card>
            </Link>
          )}

          {activeGoals.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">Your goals</h2>
                <Link to="/goals" className="text-sm font-medium text-brand-700 hover:underline">
                  View all
                </Link>
              </div>
              <Card>
                <CardBody className="flex flex-col gap-4">
                  {activeGoals.map((g) => {
                    const pct = g.targetMinor > 0 ? (g.savedMinor / g.targetMinor) * 100 : 0;
                    return (
                      <div key={g.id} className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg">
                          {g.emoji ?? <Target size={16} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium text-ink">{g.name}</p>
                            <span className="shrink-0 text-xs text-muted">
                              {Math.min(100, Math.round(pct))}%
                            </span>
                          </div>
                          <ProgressBar value={pct} className="mt-1.5" />
                        </div>
                      </div>
                    );
                  })}
                </CardBody>
              </Card>
            </div>
          )}

          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink">Your accounts</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {data.accounts.map((a) => (
                <AccountTile key={a.id} account={a} />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
              <Link to="/accounts" className="text-sm font-medium text-brand-700 hover:underline">
                View all
              </Link>
            </div>
            <Card>
              <CardBody className="px-2 py-2">
                <TransactionList transactions={data.recentTransactions} />
              </CardBody>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
