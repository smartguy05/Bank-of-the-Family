import type { FastifyPluginAsync } from "fastify";
import { healthRoutes } from "./health";

/**
 * All API routes are mounted under /api by app.ts.
 * Feature agents: add your route plugin here, e.g. `await app.register(authRoutes)`.
 */
export const registerRoutes: FastifyPluginAsync = async (app) => {
  await app.register(healthRoutes);
};
