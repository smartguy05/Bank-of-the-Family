import type { TransactionListQuery } from "@botf/shared";

/** Central query-key factory so invalidations stay consistent. */
export const queryKeys = {
  me: () => ["me"] as const,
  family: () => ["family"] as const,
  familyParents: () => ["family", "parents"] as const,
  invites: () => ["family", "invites"] as const,
  invitePreview: (code: string) => ["invite", code] as const,
  children: () => ["children"] as const,
  child: (id: string) => ["children", id] as const,
  accounts: () => ["accounts"] as const,
  account: (id: string) => ["accounts", id] as const,
  accountTransactions: (id: string, filters?: Partial<TransactionListQuery>) =>
    ["accounts", id, "transactions", filters ?? {}] as const,
  dashboardParent: () => ["dashboard", "parent"] as const,
  dashboardChild: () => ["dashboard", "child"] as const,
  transaction: (id: string) => ["transactions", id] as const,
};
