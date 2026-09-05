import {
  childSummarySchema,
  createChildBody,
  idSchema,
  okResponse,
  resetPinBody,
  updateChildBody,
  userSchema,
} from "@botf/shared";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireFamily } from "../lib/guards";
import { audit } from "../services/audit";
import {
  createChild,
  getChild,
  listChildren,
  resetChildPin,
  updateChild,
} from "../services/children";
import { notify } from "../services/notify";

export const childrenRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/children",
    {
      preHandler: [requireFamily],
      schema: { tags: ["children"], response: { 200: z.array(childSummarySchema) } },
    },
    async (request) => listChildren(app.db, request.family!.id),
  );

  r.post(
    "/children",
    {
      preHandler: [requireFamily],
      schema: { tags: ["children"], body: createChildBody, response: { 200: childSummarySchema } },
    },
    async (request) => {
      const child = await createChild(app.db, request.family!.id, request.body);
      await audit(app.db, {
        familyId: request.family!.id,
        actorUserId: request.currentUser!.id,
        action: "child.create",
        entity: "user",
        entityId: child.user.id,
        data: { username: child.user.username },
      });
      return child;
    },
  );

  r.get(
    "/children/:id",
    {
      preHandler: [requireFamily],
      schema: {
        tags: ["children"],
        params: z.object({ id: idSchema }),
        response: { 200: childSummarySchema },
      },
    },
    async (request) => getChild(app.db, request.family!.id, request.params.id),
  );

  r.patch(
    "/children/:id",
    {
      preHandler: [requireFamily],
      schema: {
        tags: ["children"],
        params: z.object({ id: idSchema }),
        body: updateChildBody,
        response: { 200: userSchema },
      },
    },
    async (request) => {
      const user = await updateChild(app.db, request.family!.id, request.params.id, request.body);
      await audit(app.db, {
        familyId: request.family!.id,
        actorUserId: request.currentUser!.id,
        action: "child.update",
        entity: "user",
        entityId: user.id,
        data: request.body,
      });
      return user;
    },
  );

  r.post(
    "/children/:id/pin",
    {
      preHandler: [requireFamily],
      schema: {
        tags: ["children"],
        params: z.object({ id: idSchema }),
        body: resetPinBody,
        response: { 200: okResponse },
      },
    },
    async (request) => {
      await resetChildPin(app.db, request.family!.id, request.params.id, request.body.pin);
      await audit(app.db, {
        familyId: request.family!.id,
        actorUserId: request.currentUser!.id,
        action: "child.pin_reset",
        entity: "user",
        entityId: request.params.id,
        data: {},
      });
      await notify(app.db, {
        userId: request.params.id,
        type: "pin_reset",
        title: "Your PIN was reset",
        body: "A parent reset your login PIN.",
        data: {},
      });
      return { ok: true as const };
    },
  );
};
