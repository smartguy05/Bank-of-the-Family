import { useMemo, useState } from "react";
import { ArrowLeftRight, Filter } from "lucide-react";
import { accountDetailRoute } from "@/router";
import type { Transaction, TransactionCategory, TransactionKind } from "@botf/shared";
import {
  CATEGORY_LABELS,
  KIND_LABELS,
  TRANSACTION_CATEGORIES,
  TRANSACTION_KINDS,
} from "@botf/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { AccountCard } from "@/components/bank/AccountCard";
import { TransactionList } from "@/components/bank/TransactionList";
import { TransactionReceipt } from "@/components/bank/TransactionReceipt";
import { TransferDialog } from "@/components/bank/MoneyDialogs";
import { useAccount, useAccounts } from "@/hooks/useAccounts";
import { useAccountTransactions } from "@/hooks/useTransactions";
import { useMe } from "@/hooks/useMe";

export function AccountDetailPage() {
  const { accountId } = accountDetailRoute.useParams();
  const { data: me } = useMe();
  const { data: account, isLoading } = useAccount(accountId);
  const { data: allAccounts } = useAccounts();
  const [kind, setKind] = useState<TransactionKind | "">("");
  const [category, setCategory] = useState<TransactionCategory | "">("");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const filters = useMemo(
    () => ({ kind: kind || undefined, category: category || undefined }),
    [kind, category],
  );
  const txQuery = useAccountTransactions(accountId, filters);

  if (isLoading || !account) {
    return (
      <div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    );
  }

  const isParent = me?.user.role === "parent";
  const transactions = txQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const ownAccounts = isParent ? (allAccounts ?? []) : (allAccounts ?? [account]);

  return (
    <div>
      <PageHeader
        title={account.name}
        actions={
          !isParent && (
            <Button
              size="sm"
              variant="secondary"
              icon={<ArrowLeftRight size={16} />}
              onClick={() => setTransferOpen(true)}
            >
              Move money
            </Button>
          )
        }
      />

      <AccountCard account={account} />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Filter size={16} className="text-muted" />
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as TransactionKind | "")}
          className="w-auto"
        >
          <option value="">All types</option>
          {TRANSACTION_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value as TransactionCategory | "")}
          className="w-auto"
        >
          <option value="">All categories</option>
          {TRANSACTION_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </div>

      <Card className="mt-4">
        <CardBody className="px-2 py-2">
          <TransactionList
            transactions={transactions}
            isLoading={txQuery.isLoading}
            hasNextPage={txQuery.hasNextPage}
            isFetchingNextPage={txQuery.isFetchingNextPage}
            onLoadMore={() => void txQuery.fetchNextPage()}
            onSelect={setSelected}
          />
        </CardBody>
      </Card>

      <TransactionReceipt
        transaction={selected}
        onClose={() => setSelected(null)}
        canReverse={isParent}
      />
      <TransferDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        accounts={ownAccounts}
        defaultAccountId={account.id}
      />
    </div>
  );
}
