import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccountTile } from "@/components/bank/AccountTile";
import { useAccounts } from "@/hooks/useAccounts";
import { Landmark } from "lucide-react";

export function AccountsPage() {
  const { data, isLoading } = useAccounts();

  return (
    <div>
      <PageHeader title="Accounts" subtitle="Checking, savings, and everything in between" />
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<Landmark size={28} />} title="No accounts yet" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.map((a) => (
            <AccountTile key={a.id} account={a} />
          ))}
        </div>
      )}
    </div>
  );
}
