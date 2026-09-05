import {
  createRequestBody,
  decideRequestBody,
  formatMoney,
  idSchema,
  moneyRequestSchema,
  paged,
  requestListQuery,
} from "@botf/shared";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { forbidden } from "../lib/errors";
import { requireChild, requireParent, requireUser } from "../lib/guards";
import { audit } from "../services/audit";
import { listParents } from "../services/families";
import {
  approveRequest,
  cancelRequest,
  createRequest,
  declineRequest,
  listRequests,
} from "../services/requests";
import { notify } from "../services/notify";

export const requestsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/requests",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["requests"],
        querystring: requestListQuery,
        response: { 200: paged(moneyRequestSchema) },
      },
    },
    async (request) => {
      const user = request.currentUser!;
      const familyId = request.family?.id;
      if (!familyId) return { items: [], nextCursor: null };
      if (user.role === "child") {
        return listRequests(app.db, { ...request.query, familyId, requesterUserId: user.id });
      }
      return listRequests(app.db, { ...request.query, familyId });
    },
  );

  r.post(
    "/requests",
    {
      preHandler: [requireChild],
      schema: {
        tags: ["requests"],
        body: createRequestBody,
        response: { 200: moneyRequestSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const user = request.currentUser!;
      const moneyRequest = await createRequest(app.db, request.family, user.id, request.body);
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: user.id,
        action: "request.create",
        entity: "money_request",
        entityId: moneyRequest.id,
        data: { accountId: moneyRequest.accountId, amountMinor: moneyRequest.amountMinor },
      });

      const parents = await listParents(app.db, request.family.id);
      const amountText = formatMoney(
        moneyRequest.amountMinor,
        request.family.currencyCode,
        request.family.locale,
      );
      await Promise.all(
        parents.map((p) =>
          notify(app.db, {
            userId: p.id,
            type: "request_submitted",
            title: `${user.displayName} requested ${amountText}`,
            body: moneyRequest.reason,
            data: { requestId: moneyRequest.id },
          }),
        ),
      );
      return moneyRequest;
    },
  );

  r.post(
    "/requests/:id/cancel",
    {
      preHandler: [requireChild],
      schema: {
        tags: ["requests"],
        params: z.object({ id: idSchema }),
        response: { 200: moneyRequestSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const moneyRequest = await cancelRequest(
        app.db,
        request.family.id,
        request.currentUser!.id,
        request.params.id,
      );
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "request.cancel",
        entity: "money_request",
        entityId: moneyRequest.id,
        data: {},
      });
      return moneyRequest;
    },
  );

  r.post(
    "/requests/:id/approve",
    {
      preHandler: [requireParent],
      schema: {
        tags: ["requests"],
        params: z.object({ id: idSchema }),
        body: decideRequestBody,
        response: { 200: moneyRequestSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const moneyRequest = await approveRequest(
        app.db,
        request.family,
        request.currentUser!.id,
        request.params.id,
        request.body.note,
      );
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "request.approve",
        entity: "money_request",
        entityId: moneyRequest.id,
        data: { transactionId: moneyRequest.transactionId },
      });
      await notify(app.db, {
        userId: moneyRequest.requesterUserId,
        type: "request_approved",
        title: "Request approved",
        body: moneyRequest.decisionNote || moneyRequest.reason,
        data: { requestId: moneyRequest.id, transactionId: moneyRequest.transactionId },
      });
      return moneyRequest;
    },
  );

  r.post(
    "/requests/:id/decline",
    {
      preHandler: [requireParent],
      schema: {
        tags: ["requests"],
        params: z.object({ id: idSchema }),
        body: decideRequestBody,
        response: { 200: moneyRequestSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const moneyRequest = await declineRequest(
        app.db,
        request.family.id,
        request.currentUser!.id,
        request.params.id,
        request.body.note,
      );
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "request.decline",
        entity: "money_request",
        entityId: moneyRequest.id,
        data: {},
      });
      await notify(app.db, {
        userId: moneyRequest.requesterUserId,
        type: "request_declined",
        title: "Request declined",
        body: moneyRequest.decisionNote || moneyRequest.reason,
        data: { requestId: moneyRequest.id },
      });
      return moneyRequest;
    },
  );
};
