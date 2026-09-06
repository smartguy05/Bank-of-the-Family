import dayjs from "dayjs";
import type { Transaction } from "@botf/shared";
import { TransactionRow } from "@/components/bank/TransactionRow";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Receipt } from "lucide-react";

export interface TransactionListProps {
  transactions: Transaction[];
  isLoading?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  onSelect?: (transaction: Transaction) => void;
  /** Map of accountId → label (e.g. "Alex · Checking") for family-wide feeds. */
  accountLabels?: Record<string, string>;
}

function dayLabel(iso: string): string {
  const d = dayjs(iso);
  if (d.isSame(dayjs(), "day")) return "Today";
  if (d.isSame(dayjs().subtract(1, "day"), "day")) return "Yesterday";
  return d.format("dddd, MMMM D");
}

export function TransactionList({
  transactions,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onSelect,
  accountLabels,
}: TransactionListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={<Receipt size={28} />}
        title="No transactions yet"
        description="Activity will show up here once money moves."
      />
    );
  }

  const groups: Array<{ label: string; items: Transaction[] }> = [];
  for (const t of transactions) {
    const label = dayLabel(t.postedAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(t);
    else groups.push({ label, items: [t] });
  }

  return (
    <div>
      {groups.map((group) => (
        <div key={group.label} className="mb-2">
          <p className="sticky top-0 bg-card/95 px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted backdrop-blur-sm">
            {group.label}
          </p>
          <div className="divide-y divide-line">
            {group.items.map((t) => (
              <TransactionRow
                key={t.id}
                transaction={t}
                onClick={onSelect}
                accountLabel={accountLabels?.[t.accountId]}
              />
            ))}
          </div>
        </div>
      ))}
      {hasNextPage && (
        <div className="flex justify-center pt-3">
          <Button variant="secondary" size="sm" loading={isFetchingNextPage} onClick={onLoadMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
