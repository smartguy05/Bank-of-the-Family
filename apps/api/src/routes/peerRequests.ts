import {
  approvePeerRequestBody,
  createPeerRequestBody,
  decideRequestBody,
  formatMoney,
  idSchema,
  paged,
  peerRequestSchema,
  requestListQuery,
} from "@botf/shared";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { forbidden } from "../lib/errors";
import { requireChild } from "../lib/guards";
import { audit } from "../services/audit";
import {
  approvePeerRequest,
  cancelPeerRequest,
  createPeerRequest,
  declinePeerRequest,
  listPeerRequests,
} from "../services/peerRequests";
import { notify } from "../services/notify";

export const peerRequestsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/peer-requests",
    {
      preHandler: [requireChild],
      schema: {
        tags: ["peer-requests"],
        querystring: requestListQuery,
        response: { 200: paged(peerRequestSchema) },
      },
    },
    async (request) => {
      const familyId = request.family?.id;
      if (!familyId) return { items: [], nextCursor: null };
      return listPeerRequests(app.db, {
        ...request.query,
        familyId,
        userId: request.currentUser!.id,
      });
    },
  );

  r.post(
    "/peer-requests",
    {
      preHandler: [requireChild],
      schema: {
        tags: ["peer-requests"],
        body: createPeerRequestBody,
        response: { 200: peerRequestSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const user = request.currentUser!;
      const peerRequest = await createPeerRequest(app.db, request.family, user.id, request.body);
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: user.id,
        action: "peer_request.create",
        entity: "peer_request",
        entityId: peerRequest.id,
        data: { payerUserId: peerRequest.payerUserId, amountMinor: peerRequest.amountMinor },
      });

      const amountText = formatMoney(
        peerRequest.amountMinor,
        request.family.currencyCode,
        request.family.locale,
      );
      await notify(app.db, {
        userId: peerRequest.payerUserId,
        type: "peer_request_received",
        title: `${user.displayName} asked you for ${amountText}`,
        body: peerRequest.reason,
        data: { peerRequestId: peerRequest.id },
      });
      return peerRequest;
    },
  );

  r.post(
    "/peer-requests/:id/cancel",
    {
      preHandler: [requireChild],
      schema: {
        tags: ["peer-requests"],
        params: z.object({ id: idSchema }),
        response: { 200: peerRequestSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const peerRequest = await cancelPeerRequest(
        app.db,
        request.family.id,
        request.currentUser!.id,
        request.params.id,
      );
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "peer_request.cancel",
        entity: "peer_request",
        entityId: peerRequest.id,
        data: {},
      });
      return peerRequest;
    },
  );

  r.post(
    "/peer-requests/:id/approve",
    {
      preHandler: [requireChild],
      schema: {
        tags: ["peer-requests"],
        params: z.object({ id: idSchema }),
        body: approvePeerRequestBody,
        response: { 200: peerRequestSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const peerRequest = await approvePeerRequest(
        app.db,
        request.family,
        request.currentUser!.id,
        request.params.id,
        request.body.fromAccountId,
        request.body.note,
      );
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "peer_request.approve",
        entity: "peer_request",
        entityId: peerRequest.id,
        data: { payerTransactionId: peerRequest.payerTransactionId },
      });
      await notify(app.db, {
        userId: peerRequest.requesterUserId,
        type: "peer_request_approved",
        title: "Request approved",
        body: peerRequest.decisionNote || peerRequest.reason,
        data: { peerRequestId: peerRequest.id, transactionId: peerRequest.requesterTransactionId },
      });
      return peerRequest;
    },
  );

  r.post(
    "/peer-requests/:id/decline",
    {
      preHandler: [requireChild],
      schema: {
        tags: ["peer-requests"],
        params: z.object({ id: idSchema }),
        body: decideRequestBody,
        response: { 200: peerRequestSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const peerRequest = await declinePeerRequest(
        app.db,
        request.family.id,
        request.currentUser!.id,
        request.params.id,
        request.body.note,
      );
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "peer_request.decline",
        entity: "peer_request",
        entityId: peerRequest.id,
        data: {},
      });
      await notify(app.db, {
        userId: peerRequest.requesterUserId,
        type: "peer_request_declined",
        title: "Request declined",
        body: peerRequest.decisionNote || peerRequest.reason,
        data: { peerRequestId: peerRequest.id },
      });
      return peerRequest;
    },
  );
};
