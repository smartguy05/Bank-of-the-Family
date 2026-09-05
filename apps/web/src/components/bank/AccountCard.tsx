import { maskAccountNumber } from "@botf/shared";
import type { Account } from "@botf/shared";
import { Money } from "@/components/ui/Money";
import { Badge } from "@/components/ui/Badge";

/** Large hero balance card for the account detail page. */
export function AccountCard({ account }: { account: Account }) {
  return (
    <div className="rounded-card bg-gradient-to-br from-brand-900 to-brand-700 p-6 text-white shadow-md">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-brand-100">
            {account.type === "savings" ? "Savings" : "Checking"}
          </p>
          <p className="mt-0.5 font-medium">{account.name}</p>
        </div>
        {account.type === "savings" && account.interestRateBps > 0 && (
          <Badge tone="accent" className="border-0 bg-white/15 text-white">
            {(account.interestRateBps / 100).toFixed(2)}% APY
          </Badge>
        )}
      </div>
      <p className="mt-6 text-4xl font-semibold tabular">
        <Money minor={account.balanceMinor} />
      </p>
      <p className="text-sm text-brand-100">Current balance</p>
      <div className="mt-4 flex items-center justify-between border-t border-white/15 pt-4 text-sm">
        <span className="text-brand-100">
          Available: <Money minor={account.availableMinor} />
        </span>
        <span className="font-mono text-brand-100">{maskAccountNumber(account.accountNumber)}</span>
      </div>
    </div>
  );
}
