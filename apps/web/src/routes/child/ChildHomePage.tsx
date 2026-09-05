import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Money } from "@/components/ui/Money";
import { AccountTile } from "@/components/bank/AccountTile";
import { TransactionList } from "@/components/bank/TransactionList";
import { useChildDashboard } from "@/hooks/useDashboard";
import { useMe } from "@/hooks/useMe";

export function ChildHomePage() {
  const { data: me } = useMe();
  const { data, isLoading } = useChildDashboard();

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
