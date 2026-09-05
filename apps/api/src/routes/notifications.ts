import {
  idSchema,
  notificationListQuery,
  notificationSchema,
  okResponse,
  paged,
  pushSubscriptionBody,
  pushUnsubscribeBody,
  unreadCountSchema,
  vapidPublicKeySchema,
} from "@botf/shared";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireUser } from "../lib/guards";
import {
  countUnread,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notify";
import { deletePushSubscription, upsertPushSubscription } from "../services/push";

export const notificationsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Public: the web app needs this before the user is signed in, to register a subscription.
  r.get(
    "/notifications/push/vapid-public-key",
    { schema: { tags: ["notifications"], response: { 200: vapidPublicKeySchema } } },
    async () => ({ publicKey: app.config.VAPID_PUBLIC_KEY ?? null }),
  );

  r.get(
    "/notifications",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["notifications"],
        querystring: notificationListQuery,
        response: { 200: paged(notificationSchema) },
      },
    },
    async (request) =>
      listNotifications(app.db, { ...request.query, userId: request.currentUser!.id }),
  );

  r.get(
    "/notifications/unread-count",
    {
      preHandler: [requireUser],
      schema: { tags: ["notifications"], response: { 200: unreadCountSchema } },
    },
    async (request) => ({ unread: await countUnread(app.db, request.currentUser!.id) }),
  );

  r.post(
    "/notifications/:id/read",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["notifications"],
        params: z.object({ id: idSchema }),
        response: { 200: okResponse },
      },
    },
    async (request) => {
      await markNotificationRead(app.db, request.currentUser!.id, request.params.id);
      return { ok: true as const };
    },
  );

  r.post(
    "/notifications/read-all",
    {
      preHandler: [requireUser],
      schema: { tags: ["notifications"], response: { 200: okResponse } },
    },
    async (request) => {
      await markAllNotificationsRead(app.db, request.currentUser!.id);
      return { ok: true as const };
    },
  );

  r.post(
    "/notifications/push/subscribe",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["notifications"],
        body: pushSubscriptionBody,
        response: { 200: okResponse },
      },
    },
    async (request) => {
      await upsertPushSubscription(app.db, request.currentUser!.id, request.body);
      return { ok: true as const };
    },
  );

  r.post(
    "/notifications/push/unsubscribe",
    {
      preHandler: [requireUser],
      schema: { tags: ["notifications"], body: pushUnsubscribeBody, response: { 200: okResponse } },
    },
    async (request) => {
      await deletePushSubscription(app.db, request.currentUser!.id, request.body.endpoint);
      return { ok: true as const };
    },
  );
};
