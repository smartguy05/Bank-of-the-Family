import type { CreateIouBody, Iou as IouDto, IouListQuery, PayIouBody } from "@botf/shared";
import { formatMoney } from "@botf/shared";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { Db, Tx } from "../db";
import type { families } from "../db/schema";
import { iouPayments, ious, users } from "../db/schema";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { getAccountOr404, getDefaultAccountForOwner } from "./accounts";
import { transferInTx } from "./ledger";

interface IouExtras {
  debtorName: string;
  creditorName: string;
  createdByName: string | null;
  payments: (typeof iouPayments.$inferSelect & { paidByName: string | null })[];
}

/** Batch-resolves debtor/creditor/creator names and payments for a page of rows (no N+1). */
async function resolveIouExtras(
  db: Db | Tx,
  rows: (typeof ious.$inferSelect)[],
): Promise<Map<string, IouExtras>> {
  const userIds = [
    ...new Set(
      rows
        .flatMap((r) => [r.debtorUserId, r.creditorUserId, r.createdByUserId])
        .filter((v): v is string => !!v),
    ),
  ];
  const iouIds = rows.map((r) => r.id);

  const userRows = userIds.length
    ? await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];
  const userMap = new Map(userRows.map((u) => [u.id, u.displayName]));

  const paymentRows = iouIds.length
    ? await db
        .select()
        .from(iouPayments)
        .where(inArray(iouPayments.iouId, iouIds))
        .orderBy(asc(iouPayments.createdAt), asc(iouPayments.id))
    : [];
  const paymentsByIou = new Map<string, (typeof iouPayments.$inferSelect)[]>();
  for (const p of paymentRows) {
    const list = paymentsByIou.get(p.iouId) ?? [];
    list.push(p);
    paymentsByIou.set(p.iouId, list);
  }

  const map = new Map<string, IouExtras>();
  for (const row of rows) {
    const payments = (paymentsByIou.get(row.id) ?? []).map((p) => ({
      ...p,
      paidByName: p.paidByUserId ? (userMap.get(p.paidByUserId) ?? null) : null,
    }));
    map.set(row.id, {
      debtorName: userMap.get(row.debtorUserId) ?? "",
      creditorName: userMap.get(row.creditorUserId) ?? "",
      createdByName: row.createdByUserId ? (userMap.get(row.createdByUserId) ?? null) : null,
      payments,
    });
  }
  return map;
}

function buildIouDto(row: typeof ious.$inferSelect, extras: IouExtras): IouDto {
  return {
    id: row.id,
    familyId: row.familyId,
    debtorUserId: row.debtorUserId,
    debtorName: extras.debtorName,
    creditorUserId: row.creditorUserId,
    creditorName: extras.creditorName,
    createdByUserId: row.createdByUserId,
    createdByName: extras.createdByName,
    amountMinor: row.amountMinor,
    paidMinor: row.paidMinor,
    remainingMinor: row.amountMinor - row.paidMinor,
    reason: row.reason,
    dueDate: row.dueDate,
    status: row.status,
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    settledAt: row.settledAt ? row.settledAt.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    closedByUserId: row.closedByUserId,
    payments: extras.payments.map((p) => ({
      id: p.id,
      iouId: p.iouId,
      amountMinor: p.amountMinor,
      fromAccountId: p.fromAccountId,
      toAccountId: p.toAccountId,
      outTransactionId: p.outTransactionId,
      inTransactionId: p.inTransactionId,
      paidByUserId: p.paidByUserId,
      paidByName: p.paidByName,
      createdAt: p.createdAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function toIouDto(db: Db | Tx, row: typeof ious.$inferSelect): Promise<IouDto> {
  const extras = await resolveIouExtras(db, [row]);
  return buildIouDto(row, extras.get(row.id)!);
}

export interface ListIousParams extends IouListQuery {
  familyId: string;
}

/** Every family member sees every IOU — deliberately no per-user narrowing. */
export async function listIous(
  db: Db,
  params: ListIousParams,
): Promise<{ items: IouDto[]; nextCursor: string | null }> {
  const conds = [eq(ious.familyId, params.familyId)];
  if (params.status) conds.push(eq(ious.status, params.status));

  if (params.cursor) {
    const decoded = decodeCursor(params.cursor);
    if (decoded) {
      conds.push(
        or(
          lt(ious.createdAt, decoded.postedAt),
          and(eq(ious.createdAt, decoded.postedAt), lt(ious.id, decoded.id))!,
        )!,
      );
    }
  }

  const limit = params.limit ?? 50;
  const rows = await db
    .select()
    .from(ious)
    .where(and(...conds))
    .orderBy(desc(ious.createdAt), desc(ious.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const extras = await resolveIouExtras(db, page);
  const items = page.map((r) => buildIouDto(r, extras.get(r.id)!));
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
  return { items, nextCursor };
}

export async function getIouOr404(
  db: Db | Tx,
  familyId: string,
  id: string,
): Promise<typeof ious.$inferSelect> {
  const [row] = await db
    .select()
    .from(ious)
    .where(and(eq(ious.id, id), eq(ious.familyId, familyId)))
    .limit(1);
  if (!row) throw notFound("IOU");
  return row;
}

export async function createIou(
  db: Db,
  family: typeof families.$inferSelect,
  actor: { id: string; role: "parent" | "child" },
  body: CreateIouBody,
): Promise<IouDto> {
  if (body.debtorUserId === body.creditorUserId) {
    throw badRequest("SAME_USER", "Someone can't owe themselves");
  }
  if (
    actor.role === "child" &&
    actor.id !== body.debtorUserId &&
    actor.id !== body.creditorUserId
  ) {
    throw forbidden("You can only record IOUs you're part of");
  }

  const parties = await db
    .select()
    .from(users)
    .where(
      and(
        inArray(users.id, [body.debtorUserId, body.creditorUserId]),
        eq(users.familyId, family.id),
        eq(users.role, "child"),
        eq(users.isActive, true),
      ),
    );
  if (parties.length < 2) throw notFound("Family member");

  const status =
    actor.role === "parent" || actor.id === body.debtorUserId ? "open" : "pending_acceptance";
  const isSelfAcknowledgedDebtor = status === "open" && actor.id === body.debtorUserId;

  const [row] = await db
    .insert(ious)
    .values({
      familyId: family.id,
      debtorUserId: body.debtorUserId,
      creditorUserId: body.creditorUserId,
      createdByUserId: actor.id,
      amountMinor: body.amountMinor,
      reason: body.reason,
      dueDate: body.dueDate ?? null,
      status,
      acceptedAt: isSelfAcknowledgedDebtor ? new Date() : null,
    })
    .returning();
  return toIouDto(db, row!);
}

export async function acceptIou(
  db: Db,
  familyId: string,
  actorUserId: string,
  id: string,
): Promise<IouDto> {
  const current = await getIouOr404(db, familyId, id);
  if (current.debtorUserId !== actorUserId) {
    throw forbidden("Only the person who owes can accept");
  }
  if (current.status !== "pending_acceptance") {
    throw conflict("IOU_NOT_PENDING", "This IOU has already been decided");
  }
  const [row] = await db
    .update(ious)
    .set({ status: "open", acceptedAt: new Date() })
    .where(eq(ious.id, id))
    .returning();
  return toIouDto(db, row!);
}

export async function declineIou(
  db: Db,
  familyId: string,
  actorUserId: string,
  id: string,
): Promise<IouDto> {
  const current = await getIouOr404(db, familyId, id);
  if (current.debtorUserId !== actorUserId) {
    throw forbidden("Only the person who owes can decline");
  }
  if (current.status !== "pending_acceptance") {
    throw conflict("IOU_NOT_PENDING", "This IOU has already been decided");
  }
  const [row] = await db
    .update(ious)
    .set({ status: "declined", closedAt: new Date(), closedByUserId: actorUserId })
    .where(eq(ious.id, id))
    .returning();
  return toIouDto(db, row!);
}

export async function cancelIou(
  db: Db,
  familyId: string,
  actor: { id: string; role: "parent" | "child" },
  id: string,
): Promise<IouDto> {
  const current = await getIouOr404(db, familyId, id);
  if (current.status !== "pending_acceptance") {
    throw conflict("IOU_NOT_PENDING", "This IOU has already been decided");
  }
  if (actor.role === "child" && current.createdByUserId !== actor.id) {
    throw forbidden("Only whoever recorded this IOU can cancel it");
  }
  const [row] = await db
    .update(ious)
    .set({ status: "cancelled", closedAt: new Date(), closedByUserId: actor.id })
    .where(eq(ious.id, id))
    .returning();
  return toIouDto(db, row!);
}

export async function forgiveIou(
  db: Db,
  familyId: string,
  parentUserId: string,
  id: string,
): Promise<IouDto> {
  const current = await getIouOr404(db, familyId, id);
  if (current.status !== "open") {
    throw conflict("IOU_NOT_OPEN", "Only an open IOU can be forgiven");
  }
  const [row] = await db
    .update(ious)
    .set({ status: "forgiven", closedAt: new Date(), closedByUserId: parentUserId })
    .where(eq(ious.id, id))
    .returning();
  return toIouDto(db, row!);
}

export async function deleteIou(db: Db, familyId: string, id: string): Promise<void> {
  const current = await getIouOr404(db, familyId, id);
  if (current.paidMinor > 0) {
    throw conflict("IOU_HAS_PAYMENTS", "Money has already moved on this IOU — forgive it instead");
  }
  await db.delete(ious).where(eq(ious.id, id));
}

export interface PayIouResult {
  iou: IouDto;
  settled: boolean;
  paymentId: string;
  inTransactionId: string;
  toAccountId: string;
}

export async function payIou(
  db: Db,
  family: typeof families.$inferSelect,
  actor: { id: string; role: "parent" | "child" },
  id: string,
  body: PayIouBody,
): Promise<PayIouResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(ious)
      .where(and(eq(ious.id, id), eq(ious.familyId, family.id)))
      .for("update");
    if (!current) throw notFound("IOU");
    if (current.status !== "open") {
      throw conflict("IOU_NOT_OPEN", "This IOU isn't open for payment");
    }
    if (actor.role === "child" && actor.id !== current.debtorUserId) {
      throw forbidden("Only the person who owes can pay this IOU");
    }

    const from = await getAccountOr404(tx, body.fromAccountId, family.id);
    if (from.ownerUserId !== current.debtorUserId) {
      if (actor.role === "child") throw notFound("Account");
      throw badRequest("ACCOUNT_NOT_DEBTORS", "Pick one of the debtor's accounts");
    }

    const remaining = current.amountMinor - current.paidMinor;
    if (body.amountMinor > remaining) {
      throw badRequest(
        "IOU_OVERPAY",
        `Only ${formatMoney(remaining, family.currencyCode, family.locale)} is left on this IOU`,
      );
    }

    const to = await getDefaultAccountForOwner(tx, current.creditorUserId, family.id);

    const paymentId = randomUUID();
    const result = await transferInTx(tx, {
      familyId: family.id,
      fromAccountId: from.id,
      toAccountId: to.id,
      amountMinor: body.amountMinor,
      memo: `IOU: ${current.reason}`,
      category: "iou",
      createdByUserId: actor.id,
      idempotencyKey: `iou:${current.id}:${paymentId}`,
    });

    await tx.insert(iouPayments).values({
      id: paymentId,
      iouId: current.id,
      familyId: family.id,
      amountMinor: body.amountMinor,
      fromAccountId: from.id,
      toAccountId: to.id,
      outTransactionId: result.out.id,
      inTransactionId: result.in.id,
      paidByUserId: actor.id,
    });

    const newPaid = current.paidMinor + body.amountMinor;
    const settled = newPaid === current.amountMinor;
    const [row] = await tx
      .update(ious)
      .set({
        paidMinor: newPaid,
        status: settled ? "settled" : "open",
        settledAt: settled ? new Date() : null,
      })
      .where(eq(ious.id, id))
      .returning();

    const iou = await toIouDto(tx, row!);
    return { iou, settled, paymentId, inTransactionId: result.in.id, toAccountId: to.id };
  });
}
