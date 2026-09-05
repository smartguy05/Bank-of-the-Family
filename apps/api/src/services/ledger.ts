import type {
  Transaction as TransactionDto,
  TransactionCategory,
  TransactionKind,
  TransactionListQuery,
} from "@botf/shared";
import { CREDIT_KINDS, DEBIT_KINDS, formatMoney } from "@botf/shared";
import { and, desc, eq, gte, inArray, lt, lte, or } from "drizzle-orm";
import type { Db, Tx } from "../db";
import { accounts, families, transactions, users } from "../db/schema";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import { isUniqueViolation } from "../lib/db-errors";
import { badRequest, conflict, notFound } from "../lib/errors";

const REVERSIBLE_KINDS: readonly TransactionKind[] = [
  "deposit",
  "charge",
  "allowance",
  "interest",
  "request_payout",
  "transfer_out",
  "transfer_in",
];

export interface PostEntryInput {
  familyId: string;
  accountId: string;
  kind: TransactionKind;
  category: TransactionCategory;
  /** Signed minor units: credits positive, debits negative. */
  amountMinor: number;
  memo?: string;
  createdByUserId: string | null;
  relatedTransactionId?: string | null;
  idempotencyKey?: string | null;
  postedAt?: Date;
}

function expectedSign(kind: TransactionKind): 1 | -1 | null {
  if ((CREDIT_KINDS as readonly string[]).includes(kind)) return 1;
  if ((DEBIT_KINDS as readonly string[]).includes(kind)) return -1;
  return null; // reversal: sign is derived from the entry being reversed, not fixed by kind.
}

/**
 * Inserts one ledger entry inside an existing transaction: locks the account row, checks it's
 * open and in the right family, enforces the overdraft rule, and updates the cached balance.
 * Callers (deposit/charge/transfer/reverse) run this inside `db.transaction`.
 */
async function insertEntry(
  tx: Tx,
  input: PostEntryInput,
): Promise<typeof transactions.$inferSelect> {
  const sign = expectedSign(input.kind);
  if (sign !== null && Math.sign(input.amountMinor) !== sign) {
    throw badRequest(
      "AMOUNT_SIGN_MISMATCH",
      `${input.kind} entries must be ${sign > 0 ? "positive" : "negative"}`,
    );
  }

  if (input.idempotencyKey) {
    const [existing] = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.familyId, input.familyId),
          eq(transactions.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return existing;
  }

  const [account] = await tx
    .select()
    .from(accounts)
    .where(eq(accounts.id, input.accountId))
    .for("update");
  if (!account || account.familyId !== input.familyId) throw notFound("Account");
  if (account.status !== "open") throw conflict("ACCOUNT_CLOSED", "This account is closed");

  const newBalance = account.balanceMinor + input.amountMinor;
  if (newBalance < 0) {
    const [family] = await tx
      .select()
      .from(families)
      .where(eq(families.id, input.familyId))
      .limit(1);
    if (!family?.allowOverdraft) {
      const available = formatMoney(
        account.balanceMinor,
        family?.currencyCode ?? "USD",
        family?.locale ?? "en-US",
      );
      throw conflict("INSUFFICIENT_FUNDS", `Insufficient funds: ${available} available`);
    }
  }

  try {
    const [row] = await tx
      .insert(transactions)
      .values({
        familyId: input.familyId,
        accountId: input.accountId,
        kind: input.kind,
        category: input.category,
        amountMinor: input.amountMinor,
        runningBalanceMinor: newBalance,
        memo: input.memo ?? "",
        createdByUserId: input.createdByUserId,
        relatedTransactionId: input.relatedTransactionId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        postedAt: input.postedAt ?? new Date(),
      })
      .returning();
    await tx
      .update(accounts)
      .set({ balanceMinor: newBalance })
      .where(eq(accounts.id, input.accountId));
    return row!;
  } catch (err) {
    if (input.idempotencyKey && isUniqueViolation(err)) {
      const [existing] = await tx
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.familyId, input.familyId),
            eq(transactions.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) return existing;
    }
    throw err;
  }
}

export async function postEntry(
  db: Db,
  input: PostEntryInput,
): Promise<typeof transactions.$inferSelect> {
  return db.transaction((tx) => insertEntry(tx, input));
}

export interface DepositOrChargeInput {
  familyId: string;
  accountId: string;
  amountMinor: number;
  category: TransactionCategory;
  memo?: string;
  createdByUserId: string | null;
  idempotencyKey?: string;
  /** Backdates the entry (e.g. demo seed history). Defaults to now. */
  postedAt?: Date;
}

export async function deposit(
  db: Db,
  input: DepositOrChargeInput,
): Promise<typeof transactions.$inferSelect> {
  return postEntry(db, { ...input, kind: "deposit", amountMinor: Math.abs(input.amountMinor) });
}

export async function charge(
  db: Db,
  input: DepositOrChargeInput,
): Promise<typeof transactions.$inferSelect> {
  return postEntry(db, { ...input, kind: "charge", amountMinor: -Math.abs(input.amountMinor) });
}

export interface TransferInput {
  familyId: string;
  fromAccountId: string;
  toAccountId: string;
  amountMinor: number;
  memo?: string;
  createdByUserId: string | null;
  idempotencyKey?: string;
  /** Backdates both legs (e.g. demo seed history). Defaults to now. */
  postedAt?: Date;
}

export interface TransferResultRows {
  out: typeof transactions.$inferSelect;
  in: typeof transactions.$inferSelect;
}

export async function transfer(db: Db, input: TransferInput): Promise<TransferResultRows> {
  if (input.fromAccountId === input.toAccountId) {
    throw badRequest("SAME_ACCOUNT", "Cannot transfer to the same account");
  }
  return db.transaction(async (tx) => {
    // Lock both accounts in a deterministic order to avoid deadlocks with concurrent transfers.
    const ids = [input.fromAccountId, input.toAccountId].sort();
    await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(inArray(accounts.id, ids))
      .for("update");

    const outKey = input.idempotencyKey ? `${input.idempotencyKey}:out` : undefined;
    const inKey = input.idempotencyKey ? `${input.idempotencyKey}:in` : undefined;

    const out = await insertEntry(tx, {
      familyId: input.familyId,
      accountId: input.fromAccountId,
      kind: "transfer_out",
      category: "transfer",
      amountMinor: -Math.abs(input.amountMinor),
      memo: input.memo ?? "",
      createdByUserId: input.createdByUserId,
      idempotencyKey: outKey,
      postedAt: input.postedAt,
    });
    const inn = await insertEntry(tx, {
      familyId: input.familyId,
      accountId: input.toAccountId,
      kind: "transfer_in",
      category: "transfer",
      amountMinor: Math.abs(input.amountMinor),
      memo: input.memo ?? "",
      createdByUserId: input.createdByUserId,
      relatedTransactionId: out.id,
      idempotencyKey: inKey,
      postedAt: input.postedAt,
    });
    const [updatedOut] = await tx
      .update(transactions)
      .set({ relatedTransactionId: inn.id })
      .where(eq(transactions.id, out.id))
      .returning();
    return { out: updatedOut!, in: inn };
  });
}

export interface ReverseInput {
  familyId: string;
  transactionId: string;
  memo?: string;
  createdByUserId: string | null;
}

export async function reverse(
  db: Db,
  input: ReverseInput,
): Promise<typeof transactions.$inferSelect> {
  return db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(transactions)
      .where(
        and(eq(transactions.id, input.transactionId), eq(transactions.familyId, input.familyId)),
      )
      .limit(1);
    if (!original) throw notFound("Transaction");
    if (!REVERSIBLE_KINDS.includes(original.kind)) {
      throw badRequest("NOT_REVERSIBLE", `${original.kind} entries cannot be reversed`);
    }
    if (original.reversedByTransactionId) {
      throw conflict("ALREADY_REVERSED", "This transaction was already reversed");
    }

    if (original.kind === "transfer_out" || original.kind === "transfer_in") {
      if (!original.relatedTransactionId)
        throw badRequest("NOT_REVERSIBLE", "Missing transfer leg");
      const [other] = await tx
        .select()
        .from(transactions)
        .where(eq(transactions.id, original.relatedTransactionId))
        .limit(1);
      if (!other) throw notFound("Transaction");
      if (other.reversedByTransactionId)
        throw conflict("ALREADY_REVERSED", "This transfer was already reversed");

      const revOriginal = await insertEntry(tx, {
        familyId: input.familyId,
        accountId: original.accountId,
        kind: "reversal",
        category: original.category,
        amountMinor: -original.amountMinor,
        memo: input.memo || `Reversal of ${original.id}`,
        createdByUserId: input.createdByUserId,
        relatedTransactionId: original.id,
      });
      const revOther = await insertEntry(tx, {
        familyId: input.familyId,
        accountId: other.accountId,
        kind: "reversal",
        category: other.category,
        amountMinor: -other.amountMinor,
        memo: input.memo || `Reversal of ${other.id}`,
        createdByUserId: input.createdByUserId,
        relatedTransactionId: other.id,
      });
      await tx
        .update(transactions)
        .set({ reversedByTransactionId: revOriginal.id })
        .where(eq(transactions.id, original.id));
      await tx
        .update(transactions)
        .set({ reversedByTransactionId: revOther.id })
        .where(eq(transactions.id, other.id));
      return revOriginal;
    }

    const reversal = await insertEntry(tx, {
      familyId: input.familyId,
      accountId: original.accountId,
      kind: "reversal",
      category: original.category,
      amountMinor: -original.amountMinor,
      memo: input.memo || `Reversal of ${original.id}`,
      createdByUserId: input.createdByUserId,
      relatedTransactionId: original.id,
    });
    await tx
      .update(transactions)
      .set({ reversedByTransactionId: reversal.id })
      .where(eq(transactions.id, original.id));
    return reversal;
  });
}

interface TransactionExtras {
  createdByName: string | null;
  counterpartyAccountId: string | null;
  counterpartyAccountName: string | null;
}

/** Batch-resolves creator names and transfer counterparty accounts for a page of rows (no N+1). */
async function resolveTransactionExtras(
  db: Db | Tx,
  rows: (typeof transactions.$inferSelect)[],
): Promise<Map<string, TransactionExtras>> {
  const creatorIds = [
    ...new Set(rows.map((r) => r.createdByUserId).filter((v): v is string => !!v)),
  ];
  const counterpartyTxIds = [
    ...new Set(
      rows
        .filter((r) => r.kind === "transfer_in" || r.kind === "transfer_out")
        .map((r) => r.relatedTransactionId)
        .filter((v): v is string => !!v),
    ),
  ];

  const creators = creatorIds.length
    ? await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, creatorIds))
    : [];
  const creatorMap = new Map(creators.map((c) => [c.id, c.displayName]));

  const counterpartyTxs = counterpartyTxIds.length
    ? await db
        .select({ id: transactions.id, accountId: transactions.accountId })
        .from(transactions)
        .where(inArray(transactions.id, counterpartyTxIds))
    : [];
  const counterpartyTxMap = new Map(counterpartyTxs.map((t) => [t.id, t.accountId]));

  const counterpartyAccountIds = [...new Set(counterpartyTxs.map((t) => t.accountId))];
  const counterpartyAccounts = counterpartyAccountIds.length
    ? await db
        .select({ id: accounts.id, name: accounts.name })
        .from(accounts)
        .where(inArray(accounts.id, counterpartyAccountIds))
    : [];
  const accountNameMap = new Map(counterpartyAccounts.map((a) => [a.id, a.name]));

  const map = new Map<string, TransactionExtras>();
  for (const row of rows) {
    const createdByName = row.createdByUserId
      ? (creatorMap.get(row.createdByUserId) ?? null)
      : null;
    let counterpartyAccountId: string | null = null;
    let counterpartyAccountName: string | null = null;
    if ((row.kind === "transfer_in" || row.kind === "transfer_out") && row.relatedTransactionId) {
      const accId = counterpartyTxMap.get(row.relatedTransactionId);
      if (accId) {
        counterpartyAccountId = accId;
        counterpartyAccountName = accountNameMap.get(accId) ?? null;
      }
    }
    map.set(row.id, { createdByName, counterpartyAccountId, counterpartyAccountName });
  }
  return map;
}

function buildTransactionDto(
  row: typeof transactions.$inferSelect,
  extras: TransactionExtras,
): TransactionDto {
  return {
    id: row.id,
    familyId: row.familyId,
    accountId: row.accountId,
    kind: row.kind,
    category: row.category,
    amountMinor: row.amountMinor,
    runningBalanceMinor: row.runningBalanceMinor,
    memo: row.memo,
    createdByUserId: row.createdByUserId,
    createdByName: extras.createdByName,
    relatedTransactionId: row.relatedTransactionId,
    counterpartyAccountId: extras.counterpartyAccountId,
    counterpartyAccountName: extras.counterpartyAccountName,
    reversedByTransactionId: row.reversedByTransactionId,
    postedAt: row.postedAt.toISOString(),
  };
}

export async function toTransactionDto(
  db: Db | Tx,
  row: typeof transactions.$inferSelect,
): Promise<TransactionDto> {
  const extras = await resolveTransactionExtras(db, [row]);
  return buildTransactionDto(row, extras.get(row.id)!);
}

/** Batch version of `toTransactionDto` — one round trip for extras instead of one per row. */
export async function toTransactionDtos(
  db: Db | Tx,
  rows: (typeof transactions.$inferSelect)[],
): Promise<TransactionDto[]> {
  const extras = await resolveTransactionExtras(db, rows);
  return rows.map((r) => buildTransactionDto(r, extras.get(r.id)!));
}

export interface ListTransactionsParams extends TransactionListQuery {
  familyId: string;
  /** Restrict to a single account. */
  accountId?: string;
  /** Restrict to any of several accounts (used for a child's home feed). */
  accountIds?: string[];
}

export async function listTransactions(
  db: Db,
  params: ListTransactionsParams,
): Promise<{ items: TransactionDto[]; nextCursor: string | null }> {
  const conds = [eq(transactions.familyId, params.familyId)];
  if (params.accountId) conds.push(eq(transactions.accountId, params.accountId));
  else if (params.accountIds) conds.push(inArray(transactions.accountId, params.accountIds));
  if (params.from) conds.push(gte(transactions.postedAt, new Date(params.from)));
  if (params.to) conds.push(lte(transactions.postedAt, new Date(params.to)));
  if (params.kind) conds.push(eq(transactions.kind, params.kind));
  if (params.category) conds.push(eq(transactions.category, params.category));

  if (params.cursor) {
    const decoded = decodeCursor(params.cursor);
    if (decoded) {
      conds.push(
        or(
          lt(transactions.postedAt, decoded.postedAt),
          and(eq(transactions.postedAt, decoded.postedAt), lt(transactions.id, decoded.id))!,
        )!,
      );
    }
  }

  const limit = params.limit ?? 50;
  const rows = await db
    .select()
    .from(transactions)
    .where(and(...conds))
    .orderBy(desc(transactions.postedAt), desc(transactions.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const extras = await resolveTransactionExtras(db, page);
  const items = page.map((r) => buildTransactionDto(r, extras.get(r.id)!));
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.postedAt, last.id) : null;
  return { items, nextCursor };
}
