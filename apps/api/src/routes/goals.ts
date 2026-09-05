import {
  allocateGoalBody,
  createGoalBody,
  idSchema,
  okResponse,
  savingsGoalSchema,
  updateGoalBody,
} from "@botf/shared";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { forbidden, notFound } from "../lib/errors";
import { requireUser } from "../lib/guards";
import { getAccountOr404 } from "../services/accounts";
import { audit } from "../services/audit";
import { listParents } from "../services/families";
import {
  allocateGoal,
  completeGoal,
  createGoal,
  deleteGoal,
  listGoals,
  updateGoal,
} from "../services/goals";
import { notify } from "../services/notify";

export const goalsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/goals",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["goals"],
        querystring: z.object({ accountId: idSchema.optional() }),
        response: { 200: z.array(savingsGoalSchema) },
      },
    },
    async (request) => {
      const user = request.currentUser!;
      const familyId = request.family?.id;
      if (!familyId) return [];

      if (request.query.accountId) {
        const account = await getAccountOr404(app.db, request.query.accountId, familyId);
        if (user.role === "child" && account.ownerUserId !== user.id) throw notFound("Account");
        return listGoals(app.db, { familyId, accountId: account.id });
      }
      if (user.role === "child") return listGoals(app.db, { familyId, ownerUserId: user.id });
      return listGoals(app.db, { familyId });
    },
  );

  r.post(
    "/goals",
    {
      preHandler: [requireUser],
      schema: { tags: ["goals"], body: createGoalBody, response: { 200: savingsGoalSchema } },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const goal = await createGoal(app.db, request.family.id, request.currentUser!, request.body);
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "goal.create",
        entity: "savings_goal",
        entityId: goal.id,
        data: { accountId: goal.accountId, targetMinor: goal.targetMinor },
      });
      return goal;
    },
  );

  r.patch(
    "/goals/:id",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["goals"],
        params: z.object({ id: idSchema }),
        body: updateGoalBody,
        response: { 200: savingsGoalSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const goal = await updateGoal(
        app.db,
        request.family.id,
        request.currentUser!,
        request.params.id,
        request.body,
      );
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "goal.update",
        entity: "savings_goal",
        entityId: goal.id,
        data: request.body,
      });
      return goal;
    },
  );

  r.delete(
    "/goals/:id",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["goals"],
        params: z.object({ id: idSchema }),
        response: { 200: okResponse },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      await deleteGoal(app.db, request.family.id, request.currentUser!, request.params.id);
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "goal.delete",
        entity: "savings_goal",
        entityId: request.params.id,
        data: {},
      });
      return { ok: true as const };
    },
  );

  r.post(
    "/goals/:id/allocate",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["goals"],
        params: z.object({ id: idSchema }),
        body: allocateGoalBody,
        response: { 200: savingsGoalSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const { goal, reachedNow } = await allocateGoal(
        app.db,
        request.family,
        request.currentUser!,
        request.params.id,
        request.body.amountMinor,
      );
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "goal.allocate",
        entity: "savings_goal",
        entityId: goal.id,
        data: { amountMinor: request.body.amountMinor },
      });
      if (reachedNow) {
        await notify(app.db, {
          userId: goal.userId,
          type: "goal_reached",
          title: "Goal reached!",
          body: `You reached your goal: ${goal.name}`,
          data: { goalId: goal.id },
        });
        const parents = await listParents(app.db, request.family.id);
        await Promise.all(
          parents
            .filter((p) => p.id !== goal.userId)
            .map((p) =>
              notify(app.db, {
                userId: p.id,
                type: "goal_reached",
                title: "Goal reached!",
                body: `A goal was reached: ${goal.name}`,
                data: { goalId: goal.id },
              }),
            ),
        );
      }
      return goal;
    },
  );

  r.post(
    "/goals/:id/complete",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["goals"],
        params: z.object({ id: idSchema }),
        response: { 200: savingsGoalSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const goal = await completeGoal(
        app.db,
        request.family.id,
        request.currentUser!,
        request.params.id,
      );
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "goal.complete",
        entity: "savings_goal",
        entityId: goal.id,
        data: {},
      });
      return goal;
    },
  );
};
