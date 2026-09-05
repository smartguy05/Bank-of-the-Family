import { and, eq } from "drizzle-orm";
import webpush from "web-push";
import type { Config } from "../config";
import type { Db } from "../db";
import { pushSubscriptions } from "../db/schema";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface PushSubscriptionKeys {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type PushSender = (
  subscription: PushSubscriptionKeys,
  payload: PushPayload,
) => Promise<void>;

let activeConfig: Config | null = null;

async function webPushSender(
  subscription: PushSubscriptionKeys,
  payload: PushPayload,
): Promise<void> {
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}

let sender: PushSender = webPushSender;

/** Called once at app startup: configures VAPID details for the real `web-push` sender. */
export function configurePush(config: Config): void {
  activeConfig = config;
  if (config.pushEnabled) {
    webpush.setVapidDetails(
      config.VAPID_SUBJECT,
      config.VAPID_PUBLIC_KEY!,
      config.VAPID_PRIVATE_KEY!,
    );
  }
}

/** Test hook: swap in a stub transport. Pass `null` to restore the real `web-push` sender. */
export function setPushSender(fn: PushSender | null): void {
  sender = fn ?? webPushSender;
}

/**
 * Sends a push notification to every subscription the user has, in parallel. No-ops when VAPID
 * isn't configured. Never throws: a dead subscription (404/410) is deleted; any other failure is
 * logged and swallowed, since a push failure must never break the request that triggered it.
 */
export async function sendPush(db: Db, userId: string, payload: PushPayload): Promise<void> {
  if (!activeConfig?.pushEnabled) return;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await sender(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number } | null)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        } else {
          console.error("push send failed", err);
        }
      }
    }),
  );
}

export interface UpsertPushSubscriptionBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

/** Upserts by endpoint. If another user already had this endpoint, ownership moves to `userId`. */
export async function upsertPushSubscription(
  db: Db,
  userId: string,
  body: UpsertPushSubscriptionBody,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, body.endpoint))
    .limit(1);
  if (existing) {
    await db
      .update(pushSubscriptions)
      .set({
        userId,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: body.userAgent ?? null,
      })
      .where(eq(pushSubscriptions.id, existing.id));
    return;
  }
  await db.insert(pushSubscriptions).values({
    userId,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    userAgent: body.userAgent ?? null,
  });
}

export async function deletePushSubscription(
  db: Db,
  userId: string,
  endpoint: string,
): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}
