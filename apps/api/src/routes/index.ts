import type { FastifyPluginAsync } from "fastify";
import { accountsRoutes } from "./accounts";
import { authRoutes } from "./auth";
import { childrenRoutes } from "./children";
import { dashboardRoutes } from "./dashboard";
import { familiesRoutes } from "./families";
import { healthRoutes } from "./health";
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
};
