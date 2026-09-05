import { childHomeSchema, parentDashboardSchema } from "@botf/shared";
import { and, count, eq, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { moneyRequests, notifications, users } from "../db/schema";
import { forbidden } from "../lib/errors";
import { requireChild, requireParent } from "../lib/guards";
import { listAccountsForOwner } from "../services/accounts";
import { listChildren } from "../services/children";
import { listTransactions } from "../services/ledger";

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/dashboard/parent",
    {
      preHandler: [requireParent],
      schema: { tags: ["dashboard"], response: { 200: parentDashboardSchema } },
    },
    async (request) => {
      if (!request.family) throw forbidden("Create or join a family first");
      const familyId = request.family.id;

      const children = await listChildren(app.db, familyId);
      const totalMinor = children
        .filter((c) => c.user.isActive)
        .reduce(
          (sum, c) =>
            sum +
            c.accounts.filter((a) => a.status === "open").reduce((s, a) => s + a.balanceMinor, 0),
          0,
        );

      const [pendingRow] = await app.db
        .select({ value: count() })
        .from(moneyRequests)
        .where(and(eq(moneyRequests.familyId, familyId), eq(moneyRequests.status, "pending")));

      const { items: recentTransactions } = await listTransactions(app.db, { familyId, limit: 15 });

      return {
        totalMinor,
        children,
        pendingRequestCount: Number(pendingRow?.value ?? 0),
        recentTransactions,
      };
    },
  );

  r.get(
    "/dashboard/child",
    {
      preHandler: [requireChild],
      schema: { tags: ["dashboard"], response: { 200: childHomeSchema } },
    },
    async (request) => {
      const user = request.currentUser!;
      const accountDtos = await listAccountsForOwner(app.db, user.id);
      const totalMinor = accountDtos
        .filter((a) => a.status === "open")
        .reduce((sum, a) => sum + a.balanceMinor, 0);

      const { items: recentTransactions } = await listTransactions(app.db, {
        familyId: user.familyId ?? "",
        accountIds: accountDtos.map((a) => a.id),
        limit: 10,
      });

      const [pendingRow] = await app.db
        .select({ value: count() })
        .from(moneyRequests)
        .where(
          and(eq(moneyRequests.requesterUserId, user.id), eq(moneyRequests.status, "pending")),
        );

      const [unreadRow] = await app.db
        .select({ value: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));

      const parents = user.familyId
        ? await app.db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.familyId, user.familyId), eq(users.role, "parent")))
        : [];

      return {
        accounts: accountDtos,
        totalMinor,
        recentTransactions,
        pendingRequestCount: Number(pendingRow?.value ?? 0),
        unreadNotifications: Number(unreadRow?.value ?? 0),
        parentIds: parents.map((p) => p.id),
      };
    },
  );
};
