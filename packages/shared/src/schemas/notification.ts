import { z } from "zod";
import { NOTIFICATION_TYPES } from "../enums";
import { idSchema, isoDateTime, pagingQuery } from "./common";

export const notificationSchema = z.object({
  id: idSchema,
  userId: idSchema,
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.unknown()),
  readAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationListQuery = pagingQuery.extend({
  unreadOnly: z.coerce.boolean().optional(),
});

export const unreadCountSchema = z.object({ unread: z.number().int() });

export const pushSubscriptionBody = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().max(500), auth: z.string().max(500) }),
  userAgent: z.string().max(300).optional(),
});
export type PushSubscriptionBody = z.infer<typeof pushSubscriptionBody>;

export const pushUnsubscribeBody = z.object({ endpoint: z.string().url().max(2000) });

export const vapidPublicKeySchema = z.object({ publicKey: z.string().nullable() });
