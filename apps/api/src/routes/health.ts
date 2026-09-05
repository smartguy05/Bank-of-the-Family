import type { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/health",
    {
      schema: {
        tags: ["system"],
        response: {
          200: z.object({ ok: z.literal(true), db: z.literal("up"), version: z.string() }),
        },
      },
    },
    async () => {
      await app.db.execute(sql`select 1`);
      return { ok: true as const, db: "up" as const, version: "0.1.0" };
    },
  );
};
