import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  ALLOWANCE_FREQUENCIES,
  NOTIFICATION_TYPES,
  REQUEST_STATUSES,
  TRANSACTION_CATEGORIES,
  TRANSACTION_KINDS,
  USER_ROLES,
} from "@botf/shared";

export const userRoleEnum = pgEnum("user_role", USER_ROLES);
export const accountTypeEnum = pgEnum("account_type", ACCOUNT_TYPES);
export const accountStatusEnum = pgEnum("account_status", ACCOUNT_STATUSES);
export const transactionKindEnum = pgEnum("transaction_kind", TRANSACTION_KINDS);
export const transactionCategoryEnum = pgEnum("transaction_category", TRANSACTION_CATEGORIES);
export const allowanceFrequencyEnum = pgEnum("allowance_frequency", ALLOWANCE_FREQUENCIES);
export const requestStatusEnum = pgEnum("request_status", REQUEST_STATUSES);
export const notificationTypeEnum = pgEnum("notification_type", NOTIFICATION_TYPES);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const families = pgTable("families", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  currencyCode: text("currency_code").notNull().default("USD"),
  locale: text("locale").notNull().default("en-US"),
  timezone: text("timezone").notNull().default("UTC"),
  allowOverdraft: boolean("allow_overdraft").notNull().default(false),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id").references(() => families.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull(),
    displayName: text("display_name").notNull(),
    avatarColor: text("avatar_color").notNull().default("#1e3a8a"),
    avatarEmoji: text("avatar_emoji"),
    /** Authentik `sub` claim; parents only. */
    authentikSub: text("authentik_sub"),
    /** Login username; children only. Stored lowercase. */
    username: text("username"),
    pinHash: text("pin_hash"),
    pinFailedAttempts: integer("pin_failed_attempts").notNull().default(0),
    pinLockedUntil: timestamp("pin_locked_until", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_authentik_sub_uq").on(t.authentikSub),
    uniqueIndex("users_username_uq").on(t.username),
    index("users_family_idx").on(t.familyId),
  ],
);

export const familyInvites = pgTable(
  "family_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    inviteeName: text("invitee_name"),
    inviteeEmail: text("invitee_email"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("family_invites_code_uq").on(t.code)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: accountTypeEnum("type").notNull(),
    name: text("name").notNull(),
    accountNumber: text("account_number").notNull(),
    interestRateBps: integer("interest_rate_bps").notNull().default(0),
    /** Cached ledger balance; the transactions table is the source of truth. */
    balanceMinor: bigint("balance_minor", { mode: "number" }).notNull().default(0),
    lastInterestPostedAt: timestamp("last_interest_posted_at", { withTimezone: true }),
    status: accountStatusEnum("status").notNull().default("open"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("accounts_number_uq").on(t.accountNumber),
    index("accounts_owner_idx").on(t.ownerUserId),
    index("accounts_family_idx").on(t.familyId),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    kind: transactionKindEnum("kind").notNull(),
    category: transactionCategoryEnum("category").notNull(),
    /** Signed minor units: credits positive, debits negative. */
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    runningBalanceMinor: bigint("running_balance_minor", { mode: "number" }).notNull(),
    memo: text("memo").notNull().default(""),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Other leg of a transfer, or the entry a reversal undoes. */
    relatedTransactionId: uuid("related_transaction_id"),
    /** Set on the original entry once it has been reversed. */
    reversedByTransactionId: uuid("reversed_by_transaction_id"),
    idempotencyKey: text("idempotency_key"),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_account_posted_idx").on(t.accountId, t.postedAt),
    index("transactions_family_posted_idx").on(t.familyId, t.postedAt),
    uniqueIndex("transactions_idempotency_uq").on(t.familyId, t.idempotencyKey),
  ],
);

export const allowanceSchedules = pgTable(
  "allowance_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    frequency: allowanceFrequencyEnum("frequency").notNull(),
    dayOfWeek: smallint("day_of_week"),
    dayOfMonth: smallint("day_of_month"),
    memo: text("memo").notNull().default("Allowance"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("allowance_next_run_idx").on(t.active, t.nextRunAt)],
);

export const savingsGoals = pgTable(
  "savings_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    emoji: text("emoji"),
    targetMinor: bigint("target_minor", { mode: "number" }).notNull(),
    savedMinor: bigint("saved_minor", { mode: "number" }).notNull().default(0),
    targetDate: text("target_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("goals_account_idx").on(t.accountId)],
);

export const moneyRequests = pgTable(
  "money_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    requesterUserId: uuid("requester_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    reason: text("reason").notNull(),
    status: requestStatusEnum("status").notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    transactionId: uuid("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [index("requests_family_status_idx").on(t.familyId, t.status)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: jsonb("data")
      .notNull()
      .default(sql`'{}'::jsonb`),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt)],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [uniqueIndex("push_endpoint_uq").on(t.endpoint)],
);

export const sessions = pgTable(
  "sessions",
  {
    sid: text("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_expire_idx").on(t.expire)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id").references(() => families.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    data: jsonb("data")
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (t) => [index("audit_family_created_idx").on(t.familyId, t.createdAt)],
);

export type Family = typeof families.$inferSelect;
export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type AllowanceSchedule = typeof allowanceSchedules.$inferSelect;
export type SavingsGoal = typeof savingsGoals.$inferSelect;
export type MoneyRequest = typeof moneyRequests.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type FamilyInvite = typeof familyInvites.$inferSelect;
