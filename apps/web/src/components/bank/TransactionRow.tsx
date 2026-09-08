import dayjs from "dayjs";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Gift,
  Landmark,
  PiggyBank,
  Receipt,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Transaction } from "@botf/shared";
import { CATEGORY_LABELS, CREDIT_KINDS } from "@botf/shared";
import { Money } from "@/components/ui/Money";
import { Badge } from "@/components/ui/Badge";

const CATEGORY_ICON: Record<Transaction["category"], LucideIcon> = {
  allowance: Wallet,
  chore: Sparkles,
  reward: Gift,
  gift: Gift,
  purchase: ShoppingBag,
  fee: Receipt,
  cash: Banknote,
  interest: PiggyBank,
  transfer: ArrowLeftRight,
  adjustment: Landmark,
  other: Receipt,
};

const KIND_ICON: Partial<Record<Transaction["kind"], LucideIcon>> = {
  withdrawal: Banknote,
  transfer_in: ArrowDownLeft,
  transfer_out: ArrowUpRight,
  reversal: RotateCcw,
};

export interface TransactionRowProps {
  transaction: Transaction;
  onClick?: (transaction: Transaction) => void;
  /** Shown before the category, e.g. "Alex · Checking" in family-wide feeds. */
  accountLabel?: string;
}

export function TransactionRow({ transaction, onClick, accountLabel }: TransactionRowProps) {
  const isCredit = CREDIT_KINDS.includes(transaction.kind) || transaction.amountMinor > 0;
  const Icon = KIND_ICON[transaction.kind] ?? CATEGORY_ICON[transaction.category];
  const reversed = Boolean(transaction.reversedByTransactionId);
  const isReversal = transaction.kind === "reversal";

  return (
    <button
      type="button"
      onClick={() => onClick?.(transaction)}
      className="flex w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded-lg"
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          isCredit ? "bg-accent-100 text-accent-600" : "bg-brand-100 text-brand-800"
        }`}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-ink">
            {transaction.memo || CATEGORY_LABELS[transaction.category]}
          </p>
          {reversed && (
            <Badge tone="warning" className="shrink-0">
              Reversed
            </Badge>
          )}
          {isReversal && (
            <Badge tone="neutral" className="shrink-0">
              Reversal
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted">
          {accountLabel ? `${accountLabel} · ` : ""}
          {CATEGORY_LABELS[transaction.category]}
          {transaction.counterpartyAccountName
            ? ` · ${transaction.counterpartyAccountName}`
            : ""} · {dayjs(transaction.postedAt).format("MMM D, h:mm A")}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-semibold tabular ${reversed ? "text-muted line-through" : ""}`}>
          <Money minor={transaction.amountMinor} signColor signDisplay="exceptZero" />
        </p>
        <p className="text-xs text-muted tabular">
          <Money minor={transaction.runningBalanceMinor} />
        </p>
      </div>
    </button>
  );
}
