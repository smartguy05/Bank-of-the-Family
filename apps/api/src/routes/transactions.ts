import type { NotificationType, TransactionCategory } from "@botf/shared";
import {
  CATEGORY_LABELS,
  chargeBody,
  depositBody,
  formatMoney,
  idSchema,
  paged,
  reverseBody,
  sendMoneyBody,
  transactionListQuery,
  transactionSchema,
  transferBody,
  transferResult,
  withdrawBody,
} from "@botf/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { App } from "../app";
import { transactions, users } from "../db/schema";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { requireChild, requireParent, requireUser } from "../lib/guards";
import { getAccountOr404, getDefaultAccountForOwner } from "../services/accounts";
import { audit } from "../services/audit";
import {
  charge,
  deposit,
  listTransactions,
  reverse,
  toTransactionDto,
  transfer,
  withdraw,
} from "../services/ledger";
import { notify } from "../services/notify";

async function notifyAccountOwner(
  app: App,
  opts: {
    account: { id: string; ownerUserId: string };
    family: { currencyCode: string; locale: string };
    actorId: string;
    type: NotificationType;
    title: string;
    category: TransactionCategory;
    amountMinor: number;
    memo: string;
    transactionId: string;
  },
): Promise<void> {
  if (opts.actorId === opts.account.ownerUserId) return;
  const amountText = formatMoney(opts.amountMinor, opts.family.currencyCode, opts.family.locale, {
    signDisplay: "always",
  });
  const categoryLabel = CATEGORY_LABELS[opts.category];
  const body = opts.memo
    ? `${amountText} ${categoryLabel} — ${opts.memo}`
    : `${amountText} ${categoryLabel}`;
  await notify(app.db, {
    userId: opts.account.ownerUserId,
    type: opts.type,
    title: opts.title,
    body,
    data: { transactionId: opts.transactionId, accountId: opts.account.id },
  });
}

export const transactionsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/transactions/deposit",
    {
      preHandler: [requireParent],
      schema: { tags: ["transactions"], body: depositBody, response: { 200: transactionSchema } },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const account = await getAccountOr404(app.db, request.body.accountId, request.family.id);
      const row = await deposit(app.db, {
        familyId: request.family.id,
        accountId: account.id,
        amountMinor: request.body.amountMinor,
        category: request.body.category,
        memo: request.body.memo,
        createdByUserId: request.currentUser!.id,
        idempotencyKey: request.body.idempotencyKey,
      });
      const dto = await toTransactionDto(app.db, row);
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "transaction.deposit",
        entity: "transaction",
        entityId: dto.id,
        data: { accountId: account.id, amountMinor: dto.amountMinor },
      });
      await notifyAccountOwner(app, {
        account,
        family: request.family,
        actorId: request.currentUser!.id,
        type: "deposit",
        title: "Deposit received",
        category: dto.category,
        amountMinor: dto.amountMinor,
        memo: dto.memo,
        transactionId: dto.id,
      });
      return dto;
    },
  );

  r.post(
    "/transactions/charge",
    {
      preHandler: [requireParent],
      schema: { tags: ["transactions"], body: chargeBody, response: { 200: transactionSchema } },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const account = await getAccountOr404(app.db, request.body.accountId, request.family.id);
      const row = await charge(app.db, {
        familyId: request.family.id,
        accountId: account.id,
        amountMinor: request.body.amountMinor,
        category: request.body.category,
        memo: request.body.memo,
        createdByUserId: request.currentUser!.id,
        idempotencyKey: request.body.idempotencyKey,
      });
      const dto = await toTransactionDto(app.db, row);
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "transaction.charge",
        entity: "transaction",
        entityId: dto.id,
        data: { accountId: account.id, amountMinor: dto.amountMinor },
      });
      await notifyAccountOwner(app, {
        account,
        family: request.family,
        actorId: request.currentUser!.id,
        type: "charge",
        title: "Charge posted",
        category: dto.category,
        amountMinor: dto.amountMinor,
        memo: dto.memo,
        transactionId: dto.id,
      });
      return dto;
    },
  );

  r.post(
    "/transactions/withdraw",
    {
      preHandler: [requireParent],
      schema: { tags: ["transactions"], body: withdrawBody, response: { 200: transactionSchema } },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const account = await getAccountOr404(app.db, request.body.accountId, request.family.id);
      const row = await withdraw(app.db, {
        familyId: request.family.id,
        accountId: account.id,
        amountMinor: request.body.amountMinor,
        category: request.body.category,
        memo: request.body.memo,
        createdByUserId: request.currentUser!.id,
        idempotencyKey: request.body.idempotencyKey,
      });
      const dto = await toTransactionDto(app.db, row);
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "transaction.withdrawal",
        entity: "transaction",
        entityId: dto.id,
        data: { accountId: account.id, amountMinor: dto.amountMinor },
      });
      await notifyAccountOwner(app, {
        account,
        family: request.family,
        actorId: request.currentUser!.id,
        type: "withdrawal",
        title: "Withdrawal posted",
        category: dto.category,
        amountMinor: dto.amountMinor,
        memo: dto.memo,
        transactionId: dto.id,
      });
      return dto;
    },
  );

  r.post(
    "/transactions/transfer",
    {
      preHandler: [requireUser],
      schema: { tags: ["transactions"], body: transferBody, response: { 200: transferResult } },
    },
    async (request) => {
      const user = request.currentUser!;
      const family = request.family;
      if (!family) throw forbidden("Create or join a family first");
      const fromAccount = await getAccountOr404(app.db, request.body.fromAccountId, family.id);
      const toAccount = await getAccountOr404(app.db, request.body.toAccountId, family.id);

      const result = await transfer(app.db, {
        familyId: family.id,
        fromAccountId: fromAccount.id,
        toAccountId: toAccount.id,
        amountMinor: request.body.amountMinor,
        memo: request.body.memo,
        createdByUserId: user.id,
        idempotencyKey: request.body.idempotencyKey,
      });
      const out = await toTransactionDto(app.db, result.out);
      const inn = await toTransactionDto(app.db, result.in);

      await audit(app.db, {
        familyId: family.id,
        actorUserId: user.id,
        action: "transaction.transfer",
        entity: "transaction",
        entityId: out.id,
        data: {
          fromAccountId: fromAccount.id,
          toAccountId: toAccount.id,
          amountMinor: out.amountMinor,
        },
      });
      await notifyAccountOwner(app, {
        account: fromAccount,
        family,
        actorId: user.id,
        type: "transfer",
        title: "Transfer sent",
        category: out.category,
        amountMinor: out.amountMinor,
        memo: out.memo,
        transactionId: out.id,
      });
      await notifyAccountOwner(app, {
        account: toAccount,
        family,
        actorId: user.id,
        type: "transfer",
        title: "Transfer received",
        category: inn.category,
        amountMinor: inn.amountMinor,
        memo: inn.memo,
        transactionId: inn.id,
      });

      return { out, in: inn };
    },
  );

  r.post(
    "/transactions/send",
    {
      preHandler: [requireChild],
      schema: { tags: ["transactions"], body: sendMoneyBody, response: { 200: transferResult } },
    },
    async (request) => {
      const user = request.currentUser!;
      const family = request.family;
      if (!family) throw forbidden("Create or join a family first");
      if (request.body.toUserId === user.id) {
        throw badRequest("SAME_USER", "Cannot send money to yourself");
      }

      const fromAccount = await getAccountOr404(app.db, request.body.fromAccountId, family.id);
      if (fromAccount.ownerUserId !== user.id) {
        throw forbidden("You can only send from your own account");
      }

      const [recipient] = await app.db
        .select()
        .from(users)
        .where(
          and(
            eq(users.id, request.body.toUserId),
            eq(users.familyId, family.id),
            eq(users.role, "child"),
            eq(users.isActive, true),
          ),
        )
        .limit(1);
      if (!recipient) throw notFound("Family member");
      const toAccount = await getDefaultAccountForOwner(app.db, recipient.id, family.id);

      const result = await transfer(app.db, {
        familyId: family.id,
        fromAccountId: fromAccount.id,
        toAccountId: toAccount.id,
        amountMinor: request.body.amountMinor,
        memo: request.body.memo,
        createdByUserId: user.id,
        idempotencyKey: request.body.idempotencyKey,
      });
      const out = await toTransactionDto(app.db, result.out);
      const inn = await toTransactionDto(app.db, result.in);

      await audit(app.db, {
        familyId: family.id,
        actorUserId: user.id,
        action: "transaction.send",
        entity: "transaction",
        entityId: out.id,
        data: { toUserId: recipient.id, amountMinor: out.amountMinor },
      });
      await notifyAccountOwner(app, {
        account: toAccount,
        family,
        actorId: user.id,
        type: "peer_transfer",
        title: `${user.displayName} sent you money`,
        category: inn.category,
        amountMinor: inn.amountMinor,
        memo: inn.memo,
        transactionId: inn.id,
      });

      return { out, in: inn };
    },
  );

  r.post(
    "/transactions/reverse",
    {
      preHandler: [requireParent],
      schema: { tags: ["transactions"], body: reverseBody, response: { 200: transactionSchema } },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const row = await reverse(app.db, {
        familyId: request.family.id,
        transactionId: request.body.transactionId,
        memo: request.body.memo,
        createdByUserId: request.currentUser!.id,
      });
      const dto = await toTransactionDto(app.db, row);
      await audit(app.db, {
        familyId: request.family.id,
        actorUserId: request.currentUser!.id,
        action: "transaction.reverse",
        entity: "transaction",
        entityId: dto.id,
        data: { originalTransactionId: request.body.transactionId },
      });
      return dto;
    },
  );

  r.get(
    "/transactions/:id",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["transactions"],
        params: z.object({ id: idSchema }),
        response: { 200: transactionSchema },
      },
    },
    async (request) => {
      const user = request.currentUser!;
      const familyId = request.family?.id;
      if (!familyId) throw notFound("Transaction");
      const [row] = await app.db
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, request.params.id), eq(transactions.familyId, familyId)))
        .limit(1);
      if (!row) throw notFound("Transaction");
      if (user.role === "child") {
        const account = await getAccountOr404(app.db, row.accountId, familyId);
        if (account.ownerUserId !== user.id) throw notFound("Transaction");
      }
      return toTransactionDto(app.db, row);
    },
  );

  r.get(
    "/transactions",
    {
      preHandler: [requireParent],
      schema: {
        tags: ["transactions"],
        querystring: transactionListQuery,
        response: { 200: paged(transactionSchema) },
      },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      return listTransactions(app.db, { ...request.query, familyId: request.family.id });
    },
  );
};
