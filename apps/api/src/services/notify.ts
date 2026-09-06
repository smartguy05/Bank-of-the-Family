import type { Notification as NotificationDto, NotificationType } from "@botf/shared";
import { and, count, desc, eq, isNull, lt, or } from "drizzle-orm";
import type { Db } from "../db";
import { notifications } from "../db/schema";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import { notFound } from "../lib/errors";
import { sendPush } from "./push";

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

function toNotificationDto(row: typeof notifications.$inferSelect): NotificationDto {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data as Record<string, unknown>,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Picks the page a tap on this notification's push should open, by type. */
function pushUrlFor(type: NotificationType, data: Record<string, unknown>): string {
  switch (type) {
    case "deposit":
    case "charge":
    case "allowance":
    case "interest":
    case "transfer":
    case "peer_transfer":
      return typeof data.accountId === "string" ? `/accounts/${data.accountId}` : "/notifications";
    case "request_submitted":
    case "request_approved":
    case "request_declined":
    case "peer_request_received":
    case "peer_request_approved":
    case "peer_request_declined":
      return "/requests";
    case "goal_reached":
      return "/goals";
    default:
      return "/notifications";
  }
}

export async function notify(
  db: Db,
  input: NotifyInput,
): Promise<typeof notifications.$inferSelect> {
  const [row] = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ?? {},
    })
    .returning();
  try {
    // sendPush already swallows its own errors; this catch is a last-resort safety net so a
    // notification never fails the request that triggered it.
    await sendPush(db, input.userId, {
      title: input.title,
      body: input.body,
      url: pushUrlFor(input.type, input.data ?? {}),
    });
  } catch {
    // ignore
  }
  return row!;
}

export interface ListNotificationsParams {
  userId: string;
  unreadOnly?: boolean;
  cursor?: string;
  limit?: number;
}

export async function listNotifications(
  db: Db,
  params: ListNotificationsParams,
): Promise<{ items: NotificationDto[]; nextCursor: string | null }> {
  const conds = [eq(notifications.userId, params.userId)];
  if (params.unreadOnly) conds.push(isNull(notifications.readAt));
  if (params.cursor) {
    const decoded = decodeCursor(params.cursor);
    if (decoded) {
      conds.push(
        or(
          lt(notifications.createdAt, decoded.postedAt),
          and(eq(notifications.createdAt, decoded.postedAt), lt(notifications.id, decoded.id))!,
        )!,
      );
    }
  }

  const limit = params.limit ?? 50;
  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conds))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map(toNotificationDto);
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
  return { items, nextCursor };
}

export async function countUnread(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.value ?? 0);
}

export async function markNotificationRead(db: Db, userId: string, id: string): Promise<void> {
  const result = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });
  if (result.length === 0) throw notFound("Notification");
}

export async function markAllNotificationsRead(db: Db, userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
