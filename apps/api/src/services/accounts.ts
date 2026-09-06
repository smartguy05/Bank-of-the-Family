import type { Account as AccountDto, CreateAccountBody, UpdateAccountBody } from "@botf/shared";
import { generateAccountNumber } from "@botf/shared";
import { and, eq, inArray, isNull, sql, asc } from "drizzle-orm";
import type { Db, Tx } from "../db";
import { accounts, savingsGoals, users } from "../db/schema";
import { conflict, notFound } from "../lib/errors";
import { isUniqueViolation } from "../lib/db-errors";

export function toAccountDto(a: typeof accounts.$inferSelect, earmarkedMinor: number): AccountDto {
  return {
    id: a.id,
    familyId: a.familyId,
    ownerUserId: a.ownerUserId,
    type: a.type,
    name: a.name,
    accountNumber: a.accountNumber,
    interestRateBps: a.interestRateBps,
    balanceMinor: a.balanceMinor,
    availableMinor: a.balanceMinor - earmarkedMinor,
    lastInterestPostedAt: a.lastInterestPostedAt ? a.lastInterestPostedAt.toISOString() : null,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
  };
}

/** Batched: money earmarked in each account's open (uncompleted) savings goals. */
/** Stable listing order: Checking before Savings, then oldest first. Reused wherever accounts are listed. */
export const accountOrder = [asc(accounts.type), asc(accounts.createdAt)] as const;

export async function earmarkedByAccount(
  db: Db | Tx,
  accountIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (accountIds.length === 0) return map;
  const rows = await db
    .select({
      accountId: savingsGoals.accountId,
      total: sql<number>`coalesce(sum(${savingsGoals.savedMinor}), 0)`,
    })
    .from(savingsGoals)
    .where(and(inArray(savingsGoals.accountId, accountIds), isNull(savingsGoals.completedAt)))
    .groupBy(savingsGoals.accountId);
  for (const row of rows) map.set(row.accountId, Number(row.total));
  return map;
}

export async function listAccountsForFamily(db: Db, familyId: string): Promise<AccountDto[]> {
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.familyId, familyId))
    .orderBy(...accountOrder);
  const earmarked = await earmarkedByAccount(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toAccountDto(r, earmarked.get(r.id) ?? 0));
}

export async function listAccountsForOwner(db: Db, ownerUserId: string): Promise<AccountDto[]> {
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.ownerUserId, ownerUserId))
    .orderBy(...accountOrder);
  const earmarked = await earmarkedByAccount(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toAccountDto(r, earmarked.get(r.id) ?? 0));
}

export async function getAccountOr404(
  db: Db | Tx,
  id: string,
  familyId: string,
): Promise<typeof accounts.$inferSelect> {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.familyId, familyId)))
    .limit(1);
  if (!row) throw notFound("Account");
  return row;
}

/**
 * Resolves an owner's default receiving account (earliest checking account, or their earliest
 * account of any type) without exposing their full account list. Used to resolve a peer-to-peer
 * send/request recipient by user id instead of by account id.
 */
export async function getDefaultAccountForOwner(
  db: Db | Tx,
  ownerUserId: string,
  familyId: string,
): Promise<typeof accounts.$inferSelect> {
  const [row] = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.ownerUserId, ownerUserId),
        eq(accounts.familyId, familyId),
        eq(accounts.status, "open"),
      ),
    )
    .orderBy(...accountOrder)
    .limit(1);
  if (!row) throw notFound("Recipient account");
  return row;
}

export async function getAccountDto(db: Db, id: string, familyId: string): Promise<AccountDto> {
  const row = await getAccountOr404(db, id, familyId);
  const earmarked = await earmarkedByAccount(db, [row.id]);
  return toAccountDto(row, earmarked.get(row.id) ?? 0);
}

export async function createAccount(
  db: Db,
  familyId: string,
  body: CreateAccountBody,
): Promise<AccountDto> {
  const [owner] = await db
    .select()
    .from(users)
    .where(
      and(eq(users.id, body.ownerUserId), eq(users.familyId, familyId), eq(users.role, "child")),
    )
    .limit(1);
  if (!owner) throw notFound("Child");

  const name = body.name?.trim() || (body.type === "savings" ? "Savings" : "Checking");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [account] = await db
        .insert(accounts)
        .values({
          familyId,
          ownerUserId: body.ownerUserId,
          type: body.type,
          name,
          interestRateBps: body.interestRateBps,
          accountNumber: generateAccountNumber(),
        })
        .returning();
      return toAccountDto(account!, 0);
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }
  throw new Error("Could not generate a unique account number");
}

export async function updateAccount(
  db: Db,
  familyId: string,
  id: string,
  body: UpdateAccountBody,
): Promise<AccountDto> {
  const row = await getAccountOr404(db, id, familyId);
  if (body.status === "closed" && row.balanceMinor !== 0) {
    throw conflict("ACCOUNT_NOT_EMPTY", "Close accounts only when the balance is zero");
  }
  const [updated] = await db.update(accounts).set(body).where(eq(accounts.id, id)).returning();
  const earmarked = await earmarkedByAccount(db, [id]);
  return toAccountDto(updated!, earmarked.get(id) ?? 0);
}
