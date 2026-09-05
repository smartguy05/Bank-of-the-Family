import { eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { families, users } from "../db/schema";
import { forbidden } from "../lib/errors";

/**
 * Loads `request.currentUser` and `request.family` from the session on every request.
 * Inactive users are rejected with 403 and have their session destroyed.
 */
export const authPlugin = fp(async (app) => {
  app.decorateRequest("currentUser", null);
  app.decorateRequest("family", null);

  app.addHook("preHandler", async (request) => {
    request.currentUser = null;
    request.family = null;

    const userId = request.session.userId;
    if (!userId) return;

    const [user] = await app.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      await request.session.destroy();
      return;
    }
    if (!user.isActive) {
      await request.session.destroy();
      throw forbidden("This account is inactive");
    }

    request.currentUser = user;
    if (user.familyId) {
      const [family] = await app.db
        .select()
        .from(families)
        .where(eq(families.id, user.familyId))
        .limit(1);
      request.family = family ?? null;
    }
  });
});
