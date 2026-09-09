import {
  createIouBody,
  formatMoney,
  idSchema,
  iouListQuery,
  iouSchema,
  okResponse,
  paged,
  payIouBody,
} from "@botf/shared";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { forbidden } from "../lib/errors";
import { requireChild, requireParent, requireUser } from "../lib/guards";
import { audit } from "../services/audit";
import {
  acceptIou,
  cancelIou,
  createIou,
  declineIou,
  deleteIou,
  forgiveIou,
  getIouOr404,
  listIous,
  payIou,
  toIouDto,
} from "../services/ious";
import { notify } from "../services/notify";

export const iousRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/ious",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["ious"],
        querystring: iouListQuery,
        response: { 200: paged(iouSchema) },
      },
    },
    async (request) => {
      const familyId = request.family?.id;
      if (!familyId) return { items: [], nextCursor: null };
      return listIous(app.db, { ...request.query, familyId });
    },
  );

  r.get(
    "/ious/:id",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["ious"],
        params: z.object({ id: idSchema }),
        response: { 200: iouSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const row = await getIouOr404(app.db, request.family.id, request.params.id);
      return toIouDto(app.db, row);
    },
  );

  r.post(
    "/ious",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["ious"],
        body: createIouBody,
        response: { 200: iouSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const user = request.currentUser!;
      const iou = await createIou(
        app.db,
        request.family,
        { id: user.id, role: user.role },
        request.body,
      );
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: user.id,
        action: "iou.create",
        entity: "iou",
        entityId: iou.id,
        data: {
          debtorUserId: iou.debtorUserId,
          creditorUserId: iou.creditorUserId,
          amountMinor: iou.amountMinor,
          status: iou.status,
        },
      });

      const amountText = formatMoney(
        iou.amountMinor,
        request.family.currencyCode,
        request.family.locale,
      );
      if (user.role === "parent") {
        await Promise.all([
          notify(app.db, {
            userId: iou.debtorUserId,
            type: "iou_created",
            title: `${user.displayName} recorded an IOU: you owe ${iou.creditorName} ${amountText}`,
            body: iou.reason,
            data: { iouId: iou.id },
          }),
          notify(app.db, {
            userId: iou.creditorUserId,
            type: "iou_created",
            title: `${user.displayName} recorded an IOU: ${iou.debtorName} owes you ${amountText}`,
            body: iou.reason,
            data: { iouId: iou.id },
          }),
        ]);
      } else if (iou.status === "pending_acceptance") {
        // Creator is the creditor; the debtor must accept.
        await notify(app.db, {
          userId: iou.debtorUserId,
          type: "iou_proposed",
          title: `${user.displayName} says you owe ${amountText}`,
          body: iou.reason,
          data: { iouId: iou.id },
        });
      } else {
        // Creator is the debtor; the creditor is notified immediately.
        await notify(app.db, {
          userId: iou.creditorUserId,
          type: "iou_created",
          title: `${user.displayName} owes you ${amountText}`,
          body: iou.reason,
          data: { iouId: iou.id },
        });
      }
      return iou;
    },
  );

  r.post(
    "/ious/:id/accept",
    {
      preHandler: [requireChild],
      schema: {
        tags: ["ious"],
        params: z.object({ id: idSchema }),
        response: { 200: iouSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const user = request.currentUser!;
      const iou = await acceptIou(app.db, request.family.id, user.id, request.params.id);
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: user.id,
        action: "iou.accept",
        entity: "iou",
        entityId: iou.id,
        data: {},
      });
      if (iou.createdByUserId) {
        await notify(app.db, {
          userId: iou.createdByUserId,
          type: "iou_accepted",
          title: `${iou.debtorName} accepted your IOU`,
          body: iou.reason,
          data: { iouId: iou.id },
        });
      }
      return iou;
    },
  );

  r.post(
    "/ious/:id/decline",
    {
      preHandler: [requireChild],
      schema: {
        tags: ["ious"],
        params: z.object({ id: idSchema }),
        response: { 200: iouSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const user = request.currentUser!;
      const iou = await declineIou(app.db, request.family.id, user.id, request.params.id);
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: user.id,
        action: "iou.decline",
        entity: "iou",
        entityId: iou.id,
        data: {},
      });
      if (iou.createdByUserId) {
        await notify(app.db, {
          userId: iou.createdByUserId,
          type: "iou_declined",
          title: `${iou.debtorName} declined your IOU`,
          body: iou.reason,
          data: { iouId: iou.id },
        });
      }
      return iou;
    },
  );

  r.post(
    "/ious/:id/cancel",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["ious"],
        params: z.object({ id: idSchema }),
        response: { 200: iouSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const user = request.currentUser!;
      const iou = await cancelIou(
        app.db,
        request.family.id,
        { id: user.id, role: user.role },
        request.params.id,
      );
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: user.id,
        action: "iou.cancel",
        entity: "iou",
        entityId: iou.id,
        data: {},
      });
      return iou;
    },
  );

  r.post(
    "/ious/:id/forgive",
    {
      preHandler: [requireParent],
      schema: {
        tags: ["ious"],
        params: z.object({ id: idSchema }),
        response: { 200: iouSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const user = request.currentUser!;
      const iou = await forgiveIou(app.db, request.family.id, user.id, request.params.id);
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: user.id,
        action: "iou.forgive",
        entity: "iou",
        entityId: iou.id,
        data: {},
      });
      const amountText = formatMoney(
        iou.amountMinor,
        request.family.currencyCode,
        request.family.locale,
      );
      await Promise.all([
        notify(app.db, {
          userId: iou.debtorUserId,
          type: "iou_forgiven",
          title: `${user.displayName} forgave an IOU`,
          body: `${amountText} — ${iou.reason}`,
          data: { iouId: iou.id },
        }),
        notify(app.db, {
          userId: iou.creditorUserId,
          type: "iou_forgiven",
          title: `${user.displayName} forgave an IOU`,
          body: `${amountText} — ${iou.reason}`,
          data: { iouId: iou.id },
        }),
      ]);
      return iou;
    },
  );

  r.post(
    "/ious/:id/pay",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["ious"],
        params: z.object({ id: idSchema }),
        body: payIouBody,
        response: { 200: iouSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const user = request.currentUser!;
      const family = request.family;
      const result = await payIou(
        app.db,
        family,
        { id: user.id, role: user.role },
        request.params.id,
        request.body,
      );
      const { iou, settled, paymentId, inTransactionId, toAccountId } = result;
      await audit(app.db, {
        familyId: family.id,
        actorUserId: user.id,
        action: "iou.pay",
        entity: "iou",
        entityId: iou.id,
        data: {
          paymentId,
          amountMinor: request.body.amountMinor,
          fromAccountId: request.body.fromAccountId,
          settled,
        },
      });

      const amountText = formatMoney(request.body.amountMinor, family.currencyCode, family.locale);
      const remainingText = formatMoney(iou.remainingMinor, family.currencyCode, family.locale);
      if (user.role === "child") {
        await notify(app.db, {
          userId: iou.creditorUserId,
          type: "iou_paid",
          title: settled
            ? `${iou.debtorName} paid off their IOU`
            : `${iou.debtorName} paid ${amountText} on an IOU`,
          body: settled ? iou.reason : `${remainingText} left — ${iou.reason}`,
          data: {
            iouId: iou.id,
            paymentId,
            transactionId: inTransactionId,
            accountId: toAccountId,
          },
        });
      } else {
        const titleSuffix = settled ? " — settled" : "";
        await Promise.all([
          notify(app.db, {
            userId: iou.creditorUserId,
            type: "iou_paid",
            title: `${user.displayName} paid ${amountText} toward ${iou.debtorName}'s IOU${titleSuffix}`,
            body: iou.reason,
            data: {
              iouId: iou.id,
              paymentId,
              transactionId: inTransactionId,
              accountId: toAccountId,
            },
          }),
          notify(app.db, {
            userId: iou.debtorUserId,
            type: "iou_paid",
            title: `${user.displayName} paid ${amountText} from your account for an IOU${titleSuffix}`,
            body: iou.reason,
            data: {
              iouId: iou.id,
              paymentId,
              transactionId: inTransactionId,
              accountId: toAccountId,
            },
          }),
        ]);
      }
      return iou;
    },
  );

  r.delete(
    "/ious/:id",
    {
      preHandler: [requireParent],
      schema: {
        tags: ["ious"],
        params: z.object({ id: idSchema }),
        response: { 200: okResponse },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const user = request.currentUser!;
      await deleteIou(app.db, request.family.id, request.params.id);
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: user.id,
        action: "iou.delete",
        entity: "iou",
        entityId: request.params.id,
        data: {},
      });
      return { ok: true as const };
    },
  );
};
