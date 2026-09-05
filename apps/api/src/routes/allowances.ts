import {
  allowanceScheduleSchema,
  createAllowanceBody,
  idSchema,
  okResponse,
  updateAllowanceBody,
} from "@botf/shared";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { forbidden, notFound } from "../lib/errors";
import { requireParent, requireUser } from "../lib/guards";
import { getAccountOr404 } from "../services/accounts";
import {
  createAllowance,
  deleteAllowance,
  listAllowances,
  updateAllowance,
} from "../services/allowances";
import { audit } from "../services/audit";

export const allowancesRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/allowances",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["allowances"],
        querystring: z.object({ accountId: idSchema.optional() }),
        response: { 200: z.array(allowanceScheduleSchema) },
      },
    },
    async (request) => {
      const user = request.currentUser!;
      const familyId = request.family?.id;
      if (!familyId) return [];

      if (request.query.accountId) {
        const account = await getAccountOr404(app.db, request.query.accountId, familyId);
        if (user.role === "child" && account.ownerUserId !== user.id) throw notFound("Account");
        return listAllowances(app.db, { familyId, accountId: account.id });
      }
      if (user.role === "child") return listAllowances(app.db, { familyId, ownerUserId: user.id });
      return listAllowances(app.db, { familyId });
    },
  );

  r.post(
    "/allowances",
    {
      preHandler: [requireParent],
      schema: {
        tags: ["allowances"],
        body: createAllowanceBody,
        response: { 200: allowanceScheduleSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const schedule = await createAllowance(
        app.db,
        request.family.id,
        request.currentUser!.id,
        request.family.timezone,
        request.body,
      );
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "allowance.create",
        entity: "allowance_schedule",
        entityId: schedule.id,
        data: { accountId: schedule.accountId, amountMinor: schedule.amountMinor },
      });
      return schedule;
    },
  );

  r.patch(
    "/allowances/:id",
    {
      preHandler: [requireParent],
      schema: {
        tags: ["allowances"],
        params: z.object({ id: idSchema }),
        body: updateAllowanceBody,
        response: { 200: allowanceScheduleSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const schedule = await updateAllowance(
        app.db,
        request.family.id,
        request.family.timezone,
        request.params.id,
        request.body,
      );
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "allowance.update",
        entity: "allowance_schedule",
        entityId: schedule.id,
        data: request.body,
      });
      return schedule;
    },
  );

  r.delete(
    "/allowances/:id",
    {
      preHandler: [requireParent],
      schema: {
        tags: ["allowances"],
        params: z.object({ id: idSchema }),
        response: { 200: okResponse },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      await deleteAllowance(app.db, request.family.id, request.params.id);
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "allowance.delete",
        entity: "allowance_schedule",
        entityId: request.params.id,
        data: {},
      });
      return { ok: true as const };
    },
  );
};
