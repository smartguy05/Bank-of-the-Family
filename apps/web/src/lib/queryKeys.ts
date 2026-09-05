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
  allowances: (accountId?: string) => ["allowances", accountId ?? "all"] as const,
  goals: (accountId?: string) => ["goals", accountId ?? "all"] as const,
  requests: (status?: string) => ["requests", status ?? "all"] as const,
  notifications: (unreadOnly?: boolean) => ["notifications", unreadOnly ?? false] as const,
  notificationsUnreadCount: () => ["notifications", "unread-count"] as const,
  statementPeriods: (accountId: string) => ["accounts", accountId, "statements"] as const,
  statement: (accountId: string, period: string) =>
    ["accounts", accountId, "statements", period] as const,
};
