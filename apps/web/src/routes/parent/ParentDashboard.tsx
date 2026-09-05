import { Link } from "@tanstack/react-router";
import { ChevronRight, Inbox, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { TotalBalanceCard } from "@/components/bank/TotalBalanceCard";
import { ChildCard } from "@/components/bank/ChildCard";
import { TransactionList } from "@/components/bank/TransactionList";
import { useParentDashboard } from "@/hooks/useDashboard";

export function ParentDashboard() {
  const { data, isLoading } = useParentDashboard();

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
