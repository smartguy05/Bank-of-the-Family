import { useState } from "react";
import dayjs from "dayjs";
import { Download, FileText, Printer } from "lucide-react";
import type { Account } from "@botf/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatementView } from "@/components/bank/StatementView";
import { useAccounts } from "@/hooks/useAccounts";
import { useChildren } from "@/hooks/useChildren";
import { useMe } from "@/hooks/useMe";
import { statementCsvUrl, useStatement, useStatementPeriods } from "@/hooks/useStatements";

type AccountOption = Account & { childName?: string };

export function StatementsPage() {
  const { data: me } = useMe();
  const isParent = me?.user.role === "parent";
  const { data: ownAccounts, isLoading: ownLoading } = useAccounts();
  const { data: children, isLoading: childrenLoading } = useChildren();

  const accounts: AccountOption[] = isParent
    ? (children ?? []).flatMap((c) =>
        c.accounts.map((a) => ({ ...a, childName: c.user.displayName })),
      )
    : (ownAccounts ?? []);
  const accountsLoading = isParent ? childrenLoading : ownLoading;

  const [accountId, setAccountId] = useState("");
  const [period, setPeriod] = useState("");

  // Pick the first account once accounts load. Adjusting state during render (rather
  // than in an effect) avoids an extra render-then-setState cascade; the condition
  // becomes false as soon as accountId is set, so this can't loop.
  if (!accountId && accounts.length > 0) {
    setAccountId(accounts[0]!.id);
  }

  const periodsQuery = useStatementPeriods(accountId || undefined);
  const periods = periodsQuery.data?.periods ?? [];

  // Same pattern: default to the newest period once the list loads, or when the
  // currently selected period is no longer valid for the selected account.
  if (periods.length > 0 && !periods.includes(period)) {
    setPeriod(periods[0]!);
  }

  const statementQuery = useStatement(accountId || undefined, period || undefined);

  function handleAccountChange(id: string) {
    setAccountId(id);
    setPeriod("");
  }

  function handleDownload() {
    if (!accountId || !period) return;
    window.location.assign(statementCsvUrl(accountId, period));
  }

  return (
    <div>
      <div className="print:hidden">
        <PageHeader title="Statements" subtitle="Monthly statements for every account" />
        {accounts.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Select
              value={accountId}
              onChange={(e) => handleAccountChange(e.target.value)}
              className="w-auto min-w-[180px]"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.childName ? ` — ${a.childName}` : ""}
                </option>
              ))}
            </Select>
            <Select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-auto min-w-[160px]"
              disabled={periods.length === 0}
            >
              {periods.length === 0 && <option value="">No statements yet</option>}
              {periods.map((p) => (
                <option key={p} value={p}>
                  {dayjs(`${p}-01`).format("MMMM YYYY")}
                </option>
              ))}
            </Select>
            <div className="ml-auto flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Printer size={16} />}
                onClick={() => window.print()}
                disabled={!statementQuery.data}
              >
                Print
              </Button>
              <Button
                size="sm"
                icon={<Download size={16} />}
                disabled={!statementQuery.data}
                onClick={handleDownload}
              >
                Download CSV
              </Button>
            </div>
          </div>
        )}
      </div>

      {accountsLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : accounts.length === 0 ? (
        <Card>
          <EmptyState icon={<FileText size={28} />} title="No accounts yet" />
        </Card>
      ) : periodsQuery.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : periods.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText size={28} />}
            title="No statements yet"
            description="Statements are generated at the end of each month once there's activity."
          />
        </Card>
      ) : statementQuery.data ? (
        <StatementView statement={statementQuery.data} />
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
    </div>
  );
}
