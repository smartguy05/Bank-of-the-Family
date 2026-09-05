import type { MoneyRequest as MoneyRequestDto, RequestListQuery } from "@botf/shared";
import { formatMoney } from "@botf/shared";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { Db, Tx } from "../db";
import type { families } from "../db/schema";
import { accounts, moneyRequests, users } from "../db/schema";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import { conflict, notFound } from "../lib/errors";
import { postEntry } from "./ledger";

interface RequestExtras {
  requesterName: string;
  accountName: string;
  decidedByName: string | null;
}

async function resolveRequestExtras(
  db: Db | Tx,
  rows: (typeof moneyRequests.$inferSelect)[],
): Promise<Map<string, RequestExtras>> {
  const userIds = [
    ...new Set(
      rows.flatMap((r) => [r.requesterUserId, r.decidedBy].filter((v): v is string => !!v)),
    ),
  ];
  const accountIds = [...new Set(rows.map((r) => r.accountId))];

  const userRows = userIds.length
    ? await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];
  const userMap = new Map(userRows.map((u) => [u.id, u.displayName]));

  const accountRows = accountIds.length
    ? await db
        .select({ id: accounts.id, name: accounts.name })
        .from(accounts)
        .where(inArray(accounts.id, accountIds))
    : [];
  const accountMap = new Map(accountRows.map((a) => [a.id, a.name]));

  const map = new Map<string, RequestExtras>();
  for (const row of rows) {
    map.set(row.id, {
      requesterName: userMap.get(row.requesterUserId) ?? "",
      accountName: accountMap.get(row.accountId) ?? "",
      decidedByName: row.decidedBy ? (userMap.get(row.decidedBy) ?? null) : null,
    });
  }
  return map;
}

function buildRequestDto(
  row: typeof moneyRequests.$inferSelect,
  extras: RequestExtras,
): MoneyRequestDto {
  return {
    id: row.id,
    familyId: row.familyId,
    requesterUserId: row.requesterUserId,
    requesterName: extras.requesterName,
    accountId: row.accountId,
    accountName: extras.accountName,
    amountMinor: row.amountMinor,
    reason: row.reason,
    status: row.status,
    decidedBy: row.decidedBy,
    decidedByName: extras.decidedByName,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    decisionNote: row.decisionNote,
    transactionId: row.transactionId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function toRequestDto(
  db: Db | Tx,
  row: typeof moneyRequests.$inferSelect,
): Promise<MoneyRequestDto> {
  const extras = await resolveRequestExtras(db, [row]);
  return buildRequestDto(row, extras.get(row.id)!);
}

export interface ListRequestsParams extends RequestListQuery {
  familyId: string;
  requesterUserId?: string;
}

export async function listRequests(
  db: Db,
  params: ListRequestsParams,
): Promise<{ items: MoneyRequestDto[]; nextCursor: string | null }> {
  const conds = [eq(moneyRequests.familyId, params.familyId)];
  if (params.requesterUserId) conds.push(eq(moneyRequests.requesterUserId, params.requesterUserId));
  if (params.status) conds.push(eq(moneyRequests.status, params.status));

  if (params.cursor) {
    // Cursor is generic (date, id) pairs; reused here against createdAt rather than postedAt.
    const decoded = decodeCursor(params.cursor);
    if (decoded) {
      conds.push(
        or(
          lt(moneyRequests.createdAt, decoded.postedAt),
          and(eq(moneyRequests.createdAt, decoded.postedAt), lt(moneyRequests.id, decoded.id))!,
        )!,
      );
    }
  }

  const limit = params.limit ?? 50;
  const rows = await db
    .select()
    .from(moneyRequests)
    .where(and(...conds))
    .orderBy(desc(moneyRequests.createdAt), desc(moneyRequests.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const extras = await resolveRequestExtras(db, page);
  const items = page.map((r) => buildRequestDto(r, extras.get(r.id)!));
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
  return { items, nextCursor };
}

export async function getRequestOr404(
  db: Db | Tx,
  familyId: string,
  id: string,
): Promise<typeof moneyRequests.$inferSelect> {
  const [row] = await db
    .select()
    .from(moneyRequests)
    .where(and(eq(moneyRequests.id, id), eq(moneyRequests.familyId, familyId)))
    .limit(1);
  if (!row) throw notFound("Request");
  return row;
}

export async function createRequest(
  db: Db,
  family: typeof families.$inferSelect,
  requesterUserId: string,
  body: { accountId: string; amountMinor: number; reason: string },
): Promise<MoneyRequestDto> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, body.accountId), eq(accounts.familyId, family.id)))
    .limit(1);
  if (!account || account.ownerUserId !== requesterUserId) throw notFound("Account");
  if (account.status !== "open") throw conflict("ACCOUNT_CLOSED", "This account is closed");
  if (body.amountMinor > account.balanceMinor) {
    throw conflict(
      "INSUFFICIENT_FUNDS",
      `Insufficient funds: ${formatMoney(account.balanceMinor, family.currencyCode, family.locale)} available`,
    );
  }

  const [row] = await db
    .insert(moneyRequests)
    .values({
      familyId: family.id,
      requesterUserId,
      accountId: account.id,
      amountMinor: body.amountMinor,
      reason: body.reason,
    })
    .returning();
  return toRequestDto(db, row!);
}

export async function cancelRequest(
  db: Db,
  familyId: string,
  requesterUserId: string,
  id: string,
): Promise<MoneyRequestDto> {
  const current = await getRequestOr404(db, familyId, id);
  if (current.requesterUserId !== requesterUserId) throw notFound("Request");
  if (current.status !== "pending") {
    throw conflict("REQUEST_NOT_PENDING", "This request has already been decided");
  }
  const [row] = await db
    .update(moneyRequests)
    .set({ status: "cancelled" })
    .where(eq(moneyRequests.id, id))
    .returning();
  return toRequestDto(db, row!);
}

export async function approveRequest(
  db: Db,
  family: typeof families.$inferSelect,
  decidedBy: string,
  id: string,
  note: string,
): Promise<MoneyRequestDto> {
  const current = await getRequestOr404(db, family.id, id);
  if (current.status !== "pending") {
    throw conflict("REQUEST_NOT_PENDING", "This request has already been decided");
  }

  // Throws INSUFFICIENT_FUNDS (409) and leaves the request untouched if the balance no longer
  // covers it — posting and the status update below only happen once the ledger accepts it.
  const txRow = await postEntry(db, {
    familyId: family.id,
    accountId: current.accountId,
    kind: "request_payout",
    category: "purchase",
    amountMinor: -current.amountMinor,
    memo: current.reason,
    createdByUserId: decidedBy,
    idempotencyKey: `request:${id}`,
  });

  const [row] = await db
    .update(moneyRequests)
    .set({
      status: "approved",
      decidedBy,
      decidedAt: new Date(),
      decisionNote: note,
      transactionId: txRow.id,
    })
    .where(eq(moneyRequests.id, id))
    .returning();
  return toRequestDto(db, row!);
}

export async function declineRequest(
  db: Db,
  familyId: string,
  decidedBy: string,
  id: string,
  note: string,
): Promise<MoneyRequestDto> {
  const current = await getRequestOr404(db, familyId, id);
  if (current.status !== "pending") {
    throw conflict("REQUEST_NOT_PENDING", "This request has already been decided");
  }
  const [row] = await db
    .update(moneyRequests)
    .set({ status: "declined", decidedBy, decidedAt: new Date(), decisionNote: note })
    .where(eq(moneyRequests.id, id))
    .returning();
  return toRequestDto(db, row!);
}
