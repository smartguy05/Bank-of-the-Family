import dayjs from "dayjs";
import { Landmark } from "lucide-react";
import type { Statement } from "@botf/shared";
import { CATEGORY_LABELS, maskAccountNumber } from "@botf/shared";
import { Money } from "@/components/ui/Money";
import { useFamilyFormat } from "@/hooks/useFamilyFormat";
import { cn } from "@/lib/cn";

/** The opening/credits/debits/interest/closing box. Extracted for reuse and unit testing. */
export function StatementSummary({ statement }: { statement: Statement }) {
  const { fmt } = useFamilyFormat();
  const rows: Array<{ label: string; value: number; emphasize?: boolean }> = [
    { label: "Opening balance", value: statement.openingBalanceMinor },
    { label: "Deposits & credits", value: statement.totalCreditsMinor },
    { label: "Withdrawals & debits", value: statement.totalDebitsMinor },
    { label: "Interest earned", value: statement.interestMinor },
    { label: "Closing balance", value: statement.closingBalanceMinor, emphasize: true },
  ];

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-5">
      {rows.map((r) => (
        <div key={r.label}>
          <p className="text-xs uppercase tracking-wide text-muted">{r.label}</p>
          <p
            className={cn(
              "tabular",
              r.emphasize ? "text-base font-semibold text-ink" : "text-sm text-ink",
            )}
          >
            {fmt(r.value)}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Full bank-statement layout: header, summary box, and a running-balance transaction table. */
export function StatementView({ statement }: { statement: Statement }) {
  return (
    <div className="rounded-card border border-line bg-card p-6 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-900 text-white">
            <Landmark size={20} />
          </div>
          <div>
            <p className="font-semibold text-ink">Bank of the Family</p>
            <p className="text-xs text-muted">{statement.familyName}</p>
          </div>
        </div>
        <div className="text-right text-sm">
          <p className="font-medium text-ink">{statement.accountName}</p>
          <p className="text-muted">{statement.ownerName}</p>
          <p className="font-mono text-muted">{maskAccountNumber(statement.accountNumber)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">
          Statement for {dayjs(`${statement.period}-01`).format("MMMM YYYY")}
        </h2>
        <p className="text-xs text-muted">
          {dayjs(statement.periodStart).format("MMM D, YYYY")} –{" "}
          {dayjs(statement.periodEnd).format("MMM D, YYYY")}
        </p>
      </div>

      <div className="mt-4">
        <StatementSummary statement={statement} />
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 pr-3 font-medium">Description</th>
              <th className="py-2 pr-3 text-right font-medium">Amount</th>
              <th className="py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {statement.transactions.map((t) => (
              <tr key={t.id}>
                <td className="py-2 pr-3 text-muted">{dayjs(t.postedAt).format("MMM D")}</td>
                <td className="py-2 pr-3 text-ink">{t.memo || CATEGORY_LABELS[t.category]}</td>
                <td className="py-2 pr-3 text-right tabular">
                  <Money minor={t.amountMinor} signColor signDisplay="exceptZero" />
                </td>
                <td className="py-2 text-right tabular text-muted">
                  <Money minor={t.runningBalanceMinor} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {statement.transactions.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">No activity this period.</p>
        )}
      </div>
    </div>
  );
}
