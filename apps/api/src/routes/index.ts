import type { FastifyPluginAsync } from "fastify";
import { accountsRoutes } from "./accounts";
import { allowancesRoutes } from "./allowances";
import { authRoutes } from "./auth";
import { childrenRoutes } from "./children";
import { dashboardRoutes } from "./dashboard";
import { familiesRoutes } from "./families";
import { goalsRoutes } from "./goals";
import { healthRoutes } from "./health";
import { notificationsRoutes } from "./notifications";
import { peerRequestsRoutes } from "./peerRequests";
import { requestsRoutes } from "./requests";
import { statementsRoutes } from "./statements";
import { transactionsRoutes } from "./transactions";

/**
 * All API routes are mounted under /api by app.ts.
 * Feature agents: add your route plugin here, e.g. `await app.register(authRoutes)`.
 */
export const registerRoutes: FastifyPluginAsync = async (app) => {
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(familiesRoutes);
  await app.register(childrenRoutes);
  await app.register(accountsRoutes);
  await app.register(transactionsRoutes);
  await app.register(dashboardRoutes);
  await app.register(allowancesRoutes);
  await app.register(goalsRoutes);
  await app.register(requestsRoutes);
  await app.register(peerRequestsRoutes);
  await app.register(notificationsRoutes);
  await app.register(statementsRoutes);
};
