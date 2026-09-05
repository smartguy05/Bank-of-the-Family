import {
  idSchema,
  statementPeriod,
  statementPeriodListSchema,
  statementSchema,
} from "@botf/shared";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { users } from "../db/schema";
import { notFound } from "../lib/errors";
import { requireUser } from "../lib/guards";
import { getAccountOr404 } from "../services/accounts";
import { buildStatement, listStatementPeriods, statementToCsv } from "../services/statements";

export const statementsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/accounts/:id/statements",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["statements"],
        params: z.object({ id: idSchema }),
        response: { 200: statementPeriodListSchema },
      },
    },
    async (request) => {
      const user = request.currentUser!;
      const familyId = request.family?.id;
      if (!familyId) throw notFound("Account");
      const account = await getAccountOr404(app.db, request.params.id, familyId);
      if (user.role === "child" && account.ownerUserId !== user.id) throw notFound("Account");
      return { periods: listStatementPeriods(account, request.family!, new Date()) };
    },
  );

  r.get(
    "/accounts/:id/statements/:period",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["statements"],
        params: z.object({ id: idSchema, period: statementPeriod }),
        response: { 200: statementSchema },
      },
    },
    async (request) => {
      const user = request.currentUser!;
      const familyId = request.family?.id;
      if (!familyId) throw notFound("Account");
      const account = await getAccountOr404(app.db, request.params.id, familyId);
      if (user.role === "child" && account.ownerUserId !== user.id) throw notFound("Account");
      const [owner] = await app.db
        .select()
        .from(users)
        .where(eq(users.id, account.ownerUserId))
        .limit(1);
      return buildStatement(app.db, account, request.family!, owner!, request.params.period);
    },
  );

  r.get(
    "/accounts/:id/statements/:period/csv",
    {
      preHandler: [requireUser],
      // No Zod response schema here: this route streams a text/csv attachment, not a JSON body,
      // and fastify-type-provider-zod's response serializer only understands JSON-shaped schemas.
      schema: {
        tags: ["statements"],
        params: z.object({ id: idSchema, period: statementPeriod }),
      },
    },
    async (request, reply) => {
      const user = request.currentUser!;
      const familyId = request.family?.id;
      if (!familyId) throw notFound("Account");
      const account = await getAccountOr404(app.db, request.params.id, familyId);
      if (user.role === "child" && account.ownerUserId !== user.id) throw notFound("Account");
      const [owner] = await app.db
        .select()
        .from(users)
        .where(eq(users.id, account.ownerUserId))
        .limit(1);
      const statement = await buildStatement(
        app.db,
        account,
        request.family!,
        owner!,
        request.params.period,
      );
      const csv = statementToCsv(statement, request.family!.currencyCode);
      reply
        .type("text/csv")
        .header(
          "content-disposition",
          `attachment; filename="statement-${account.accountNumber}-${request.params.period}.csv"`,
        );
      return csv;
    },
  );
};
