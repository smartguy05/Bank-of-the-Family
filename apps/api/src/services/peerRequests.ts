import type { PeerRequest as PeerRequestDto, RequestListQuery } from "@botf/shared";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { Db, Tx } from "../db";
import type { families } from "../db/schema";
import { accounts, peerRequests, users } from "../db/schema";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import { badRequest, conflict, notFound } from "../lib/errors";
import { transfer } from "./ledger";

interface PeerRequestExtras {
  requesterName: string;
  requesterAccountName: string;
  payerName: string;
  payerAccountName: string | null;
}

async function resolvePeerRequestExtras(
  db: Db | Tx,
  rows: (typeof peerRequests.$inferSelect)[],
): Promise<Map<string, PeerRequestExtras>> {
  const userIds = [...new Set(rows.flatMap((r) => [r.requesterUserId, r.payerUserId]))];
  const accountIds = [
    ...new Set(
      rows.flatMap((r) => [r.requesterAccountId, r.payerAccountId].filter((v): v is string => !!v)),
    ),
  ];

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

  const map = new Map<string, PeerRequestExtras>();
  for (const row of rows) {
    map.set(row.id, {
      requesterName: userMap.get(row.requesterUserId) ?? "",
      requesterAccountName: accountMap.get(row.requesterAccountId) ?? "",
      payerName: userMap.get(row.payerUserId) ?? "",
      payerAccountName: row.payerAccountId ? (accountMap.get(row.payerAccountId) ?? null) : null,
    });
  }
  return map;
}

function buildPeerRequestDto(
  row: typeof peerRequests.$inferSelect,
  extras: PeerRequestExtras,
): PeerRequestDto {
  return {
    id: row.id,
    familyId: row.familyId,
    requesterUserId: row.requesterUserId,
    requesterName: extras.requesterName,
    requesterAccountId: row.requesterAccountId,
    requesterAccountName: extras.requesterAccountName,
    payerUserId: row.payerUserId,
    payerName: extras.payerName,
    payerAccountId: row.payerAccountId,
    payerAccountName: extras.payerAccountName,
    amountMinor: row.amountMinor,
    reason: row.reason,
    status: row.status,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    decisionNote: row.decisionNote,
    payerTransactionId: row.payerTransactionId,
    requesterTransactionId: row.requesterTransactionId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function toPeerRequestDto(
  db: Db | Tx,
  row: typeof peerRequests.$inferSelect,
): Promise<PeerRequestDto> {
  const extras = await resolvePeerRequestExtras(db, [row]);
  return buildPeerRequestDto(row, extras.get(row.id)!);
}

export interface ListPeerRequestsParams extends RequestListQuery {
  familyId: string;
  userId: string;
}

export async function listPeerRequests(
  db: Db,
  params: ListPeerRequestsParams,
): Promise<{ items: PeerRequestDto[]; nextCursor: string | null }> {
  const conds = [
    eq(peerRequests.familyId, params.familyId),
    or(
      eq(peerRequests.requesterUserId, params.userId),
      eq(peerRequests.payerUserId, params.userId),
    )!,
  ];
  if (params.status) conds.push(eq(peerRequests.status, params.status));

  if (params.cursor) {
    const decoded = decodeCursor(params.cursor);
    if (decoded) {
      conds.push(
        or(
          lt(peerRequests.createdAt, decoded.postedAt),
          and(eq(peerRequests.createdAt, decoded.postedAt), lt(peerRequests.id, decoded.id))!,
        )!,
      );
    }
  }

  const limit = params.limit ?? 50;
  const rows = await db
    .select()
    .from(peerRequests)
    .where(and(...conds))
    .orderBy(desc(peerRequests.createdAt), desc(peerRequests.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const extras = await resolvePeerRequestExtras(db, page);
  const items = page.map((r) => buildPeerRequestDto(r, extras.get(r.id)!));
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
  return { items, nextCursor };
}

export async function getPeerRequestOr404(
  db: Db | Tx,
  familyId: string,
  id: string,
): Promise<typeof peerRequests.$inferSelect> {
  const [row] = await db
    .select()
    .from(peerRequests)
    .where(and(eq(peerRequests.id, id), eq(peerRequests.familyId, familyId)))
    .limit(1);
  if (!row) throw notFound("Request");
  return row;
}

export async function createPeerRequest(
  db: Db,
  family: typeof families.$inferSelect,
  requesterUserId: string,
  body: { payerUserId: string; requesterAccountId: string; amountMinor: number; reason: string },
): Promise<PeerRequestDto> {
  if (body.payerUserId === requesterUserId) {
    throw badRequest("SAME_USER", "Cannot request money from yourself");
  }

  const [requesterAccount] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, body.requesterAccountId), eq(accounts.familyId, family.id)))
    .limit(1);
  if (!requesterAccount || requesterAccount.ownerUserId !== requesterUserId) {
    throw notFound("Account");
  }

  const [payer] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.id, body.payerUserId),
        eq(users.familyId, family.id),
        eq(users.role, "child"),
        eq(users.isActive, true),
      ),
    )
    .limit(1);
  if (!payer) throw notFound("Family member");

  const [row] = await db
    .insert(peerRequests)
    .values({
      familyId: family.id,
      requesterUserId,
      requesterAccountId: requesterAccount.id,
      payerUserId: payer.id,
      amountMinor: body.amountMinor,
      reason: body.reason,
    })
    .returning();
  return toPeerRequestDto(db, row!);
}

export async function cancelPeerRequest(
  db: Db,
  familyId: string,
  requesterUserId: string,
  id: string,
): Promise<PeerRequestDto> {
  const current = await getPeerRequestOr404(db, familyId, id);
  if (current.requesterUserId !== requesterUserId) throw notFound("Request");
  if (current.status !== "pending") {
    throw conflict("REQUEST_NOT_PENDING", "This request has already been decided");
  }
  const [row] = await db
    .update(peerRequests)
    .set({ status: "cancelled" })
    .where(eq(peerRequests.id, id))
    .returning();
  return toPeerRequestDto(db, row!);
}

export async function approvePeerRequest(
  db: Db,
  family: typeof families.$inferSelect,
  payerUserId: string,
  id: string,
  fromAccountId: string,
  note: string,
): Promise<PeerRequestDto> {
  const current = await getPeerRequestOr404(db, family.id, id);
  if (current.payerUserId !== payerUserId) throw notFound("Request");
  if (current.status !== "pending") {
    throw conflict("REQUEST_NOT_PENDING", "This request has already been decided");
  }

  const [payerAccount] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, fromAccountId), eq(accounts.familyId, family.id)))
    .limit(1);
  if (!payerAccount || payerAccount.ownerUserId !== payerUserId) throw notFound("Account");

  // Throws INSUFFICIENT_FUNDS/ACCOUNT_CLOSED and leaves the request untouched if it can't be
  // paid — the status update below only happens once the ledger accepts the transfer.
  const result = await transfer(db, {
    familyId: family.id,
    fromAccountId: payerAccount.id,
    toAccountId: current.requesterAccountId,
    amountMinor: current.amountMinor,
    memo: current.reason,
    createdByUserId: payerUserId,
    idempotencyKey: `peer-request:${id}`,
  });

  const [row] = await db
    .update(peerRequests)
    .set({
      status: "approved",
      payerAccountId: payerAccount.id,
      payerTransactionId: result.out.id,
      requesterTransactionId: result.in.id,
      decidedAt: new Date(),
      decisionNote: note,
    })
    .where(eq(peerRequests.id, id))
    .returning();
  return toPeerRequestDto(db, row!);
}

export async function declinePeerRequest(
  db: Db,
  familyId: string,
  payerUserId: string,
  id: string,
  note: string,
): Promise<PeerRequestDto> {
  const current = await getPeerRequestOr404(db, familyId, id);
  if (current.payerUserId !== payerUserId) throw notFound("Request");
  if (current.status !== "pending") {
    throw conflict("REQUEST_NOT_PENDING", "This request has already been decided");
  }
  const [row] = await db
    .update(peerRequests)
    .set({ status: "declined", decidedAt: new Date(), decisionNote: note })
    .where(eq(peerRequests.id, id))
    .returning();
  return toPeerRequestDto(db, row!);
}
