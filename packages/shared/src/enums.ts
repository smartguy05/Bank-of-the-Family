export const USER_ROLES = ["parent", "child"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ACCOUNT_TYPES = ["checking", "savings"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_STATUSES = ["open", "closed"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** How a ledger entry came to exist. Sign of amount is determined by the kind. */
export const TRANSACTION_KINDS = [
  "deposit", // parent-initiated credit
  "charge", // parent-initiated debit
  "transfer_in", // credit leg of a transfer
  "transfer_out", // debit leg of a transfer
  "interest", // monthly interest credit
  "allowance", // scheduled allowance credit
  "request_payout", // debit posted when a money request is approved
  "reversal", // reverses a prior entry (opposite sign)
] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const CREDIT_KINDS: readonly TransactionKind[] = [
  "deposit",
  "transfer_in",
  "interest",
  "allowance",
];
export const DEBIT_KINDS: readonly TransactionKind[] = ["charge", "transfer_out", "request_payout"];

export const TRANSACTION_CATEGORIES = [
  "allowance",
  "chore",
  "reward",
  "gift",
  "purchase",
  "fee",
  "interest",
  "transfer",
  "adjustment",
  "other",
] as const;
export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];

/** Categories a parent may pick when depositing. */
export const DEPOSIT_CATEGORIES: readonly TransactionCategory[] = [
  "allowance",
  "chore",
  "reward",
  "gift",
  "adjustment",
  "other",
];
/** Categories a parent may pick when charging. */
export const CHARGE_CATEGORIES: readonly TransactionCategory[] = [
  "purchase",
  "fee",
  "adjustment",
  "other",
];

export const ALLOWANCE_FREQUENCIES = ["weekly", "biweekly", "monthly"] as const;
export type AllowanceFrequency = (typeof ALLOWANCE_FREQUENCIES)[number];

export const REQUEST_STATUSES = ["pending", "approved", "declined", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  "deposit",
  "charge",
  "allowance",
  "interest",
  "transfer",
  "goal_reached",
  "request_submitted",
  "request_approved",
  "request_declined",
  "pin_reset",
  "system",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  allowance: "Allowance",
  chore: "Chore",
  reward: "Reward",
  gift: "Gift",
  purchase: "Purchase",
  fee: "Fee",
  interest: "Interest",
  transfer: "Transfer",
  adjustment: "Adjustment",
  other: "Other",
};

export const KIND_LABELS: Record<TransactionKind, string> = {
  deposit: "Deposit",
  charge: "Charge",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  interest: "Interest",
  allowance: "Allowance",
  request_payout: "Request payout",
  reversal: "Reversal",
};
