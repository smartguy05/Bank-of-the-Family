import {
  accountSchema,
  createAccountBody,
  idSchema,
  paged,
  transactionListQuery,
  transactionSchema,
  updateAccountBody,
} from "@botf/shared";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { forbidden, notFound } from "../lib/errors";
import { requireParent, requireUser } from "../lib/guards";
import {
  createAccount,
  getAccountDto,
  getAccountOr404,
  listAccountsForFamily,
  listAccountsForOwner,
  updateAccount,
} from "../services/accounts";
import { audit } from "../services/audit";
import { listTransactions } from "../services/ledger";

export const accountsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/accounts",
    {
      preHandler: [requireUser],
      schema: { tags: ["accounts"], response: { 200: z.array(accountSchema) } },
    },
    async (request) => {
      const user = request.currentUser!;
      if (user.role === "parent") {
        if (!request.family) return [];
        return listAccountsForFamily(app.db, request.family.id);
      }
      return listAccountsForOwner(app.db, user.id);
    },
  );

  r.post(
    "/accounts",
    {
      preHandler: [requireParent],
      schema: { tags: ["accounts"], body: createAccountBody, response: { 200: accountSchema } },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const account = await createAccount(app.db, request.family.id, request.body);
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "account.create",
        entity: "account",
        entityId: account.id,
        data: { ownerUserId: request.body.ownerUserId, type: request.body.type },
      });
      return account;
    },
  );

  r.get(
    "/accounts/:id",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["accounts"],
        params: z.object({ id: idSchema }),
        response: { 200: accountSchema },
      },
    },
    async (request) => {
      const user = request.currentUser!;
      const familyId = request.family?.id;
      if (!familyId) throw notFound("Account");
      const account = await getAccountDto(app.db, request.params.id, familyId);
      if (user.role === "child" && account.ownerUserId !== user.id) throw notFound("Account");
      return account;
    },
  );

  r.patch(
    "/accounts/:id",
    {
      preHandler: [requireParent],
      schema: {
        tags: ["accounts"],
        params: z.object({ id: idSchema }),
        body: updateAccountBody,
        response: { 200: accountSchema },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const account = await updateAccount(
        app.db,
        request.family.id,
        request.params.id,
        request.body,
      );
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "account.update",
        entity: "account",
        entityId: account.id,
        data: request.body,
      });
      return account;
    },
  );

  r.get(
    "/accounts/:id/transactions",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["accounts"],
        params: z.object({ id: idSchema }),
        querystring: transactionListQuery,
        response: { 200: paged(transactionSchema) },
      },
    },
    async (request) => {
      const user = request.currentUser!;
      const familyId = request.family?.id;
      if (!familyId) throw notFound("Account");
      const account = await getAccountOr404(app.db, request.params.id, familyId);
      if (user.role === "child" && account.ownerUserId !== user.id) throw notFound("Account");
      return listTransactions(app.db, { ...request.query, familyId, accountId: account.id });
    },
  );
};
