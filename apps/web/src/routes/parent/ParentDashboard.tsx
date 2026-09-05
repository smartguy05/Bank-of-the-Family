import dayjs from "dayjs";
import { Link } from "@tanstack/react-router";
import { CalendarClock, ChevronRight, Inbox, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { TotalBalanceCard } from "@/components/bank/TotalBalanceCard";
import { ChildCard } from "@/components/bank/ChildCard";
import { TransactionList } from "@/components/bank/TransactionList";
import { useParentDashboard } from "@/hooks/useDashboard";
import { useAllowances } from "@/hooks/useAllowances";

export function ParentDashboard() {
  const { data, isLoading } = useParentDashboard();
  const { data: allowances } = useAllowances();

  const accountOwner = new Map<string, string>();
  for (const child of data?.children ?? []) {
    for (const acc of child.accounts) accountOwner.set(acc.id, child.user.displayName);
  }
  const upcomingAllowances = (allowances ?? [])
    .filter((a) => a.active)
    .sort((a, b) => dayjs(a.nextRunAt).diff(dayjs(b.nextRunAt)))
    .slice(0, 4);

  return (
    <div>
      <PageHeader title="Home" subtitle="Your family's accounts at a glance" />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : data ? (
        <div className="flex flex-col gap-5">
          <TotalBalanceCard totalMinor={data.totalMinor} childCount={data.children.length} />

          {data.pendingRequestCount > 0 && (
            <Link to="/requests">
              <Card className="flex items-center gap-3 p-4 transition-shadow hover:shadow-md">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/10 text-warning">
                  <Inbox size={18} />
                </div>
                <p className="flex-1 text-sm font-medium text-ink">
                  {data.pendingRequestCount} pending{" "}
                  {data.pendingRequestCount === 1 ? "request" : "requests"} need your review
                </p>
                <ChevronRight size={18} className="text-muted" />
              </Card>
            </Link>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Kids</h2>
              <Link to="/children" className="text-sm font-medium text-brand-700 hover:underline">
                View all
              </Link>
            </div>
            {data.children.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Users size={28} />}
                  title="No kids yet"
                  description="Add your first child to open their accounts."
                  action={
                    <Link to="/children">
                      <Button size="sm">Add a child</Button>
                    </Link>
                  }
                />
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data.children.map((c) => (
                  <ChildCard key={c.user.id} child={c} />
                ))}
              </div>
            )}
          </div>

          {upcomingAllowances.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-ink">Upcoming allowances</h2>
              <Card>
                <CardBody className="flex flex-col divide-y divide-line px-4 py-1">
                  {upcomingAllowances.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 py-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-800">
                        <CalendarClock size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">
                          {accountOwner.get(a.accountId) ?? "Account"}
                        </p>
                        <p className="text-xs text-muted">
                          {dayjs(a.nextRunAt).format("MMM D, YYYY")}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular text-ink">
                        <Money minor={a.amountMinor} />
                      </p>
                    </div>
                  ))}
                </CardBody>
              </Card>
            </div>
          )}

          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink">Recent activity</h2>
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
