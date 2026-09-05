import { Link } from "@tanstack/react-router";
import { Landmark, PiggyBank } from "lucide-react";
import type { Account } from "@botf/shared";
import { maskAccountNumber } from "@botf/shared";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";

const TYPE_LABEL: Record<Account["type"], string> = { checking: "Checking", savings: "Savings" };

export function AccountTile({ account }: { account: Account }) {
  const Icon = account.type === "savings" ? PiggyBank : Landmark;
  return (
    <Link
      to="/accounts/$accountId"
      params={{ accountId: account.id }}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded-card"
    >
      <Card className="p-4 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-800">
              <Icon size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">{account.name}</p>
              <p className="text-xs text-muted">
                {TYPE_LABEL[account.type]} · {maskAccountNumber(account.accountNumber)}
              </p>
            </div>
          </div>
          {account.type === "savings" && account.interestRateBps > 0 && (
            <Badge tone="accent">{(account.interestRateBps / 100).toFixed(2)}% APY</Badge>
          )}
        </div>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Current</p>
            <p className="text-lg font-semibold text-ink">
              <Money minor={account.balanceMinor} />
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted">Available</p>
            <p className="text-sm font-medium text-muted">
              <Money minor={account.availableMinor} />
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
