import type { SessionStore } from "@fastify/session";
import { eq, lt } from "drizzle-orm";
import type { Db } from "../db";
import { sessions } from "../db/schema";

/**
 * Postgres-backed session store so parent (OIDC) and child (PIN) sessions
 * share one cookie mechanism and can be revoked server-side.
 */
export function createPgSessionStore(db: Db, ttlMs: number): SessionStore {
  return {
    set(sid, session, callback) {
      const expire = new Date(Date.now() + (session.cookie?.maxAge ?? ttlMs));
      db.insert(sessions)
        .values({ sid, sess: session as unknown as Record<string, unknown>, expire })
        .onConflictDoUpdate({
          target: sessions.sid,
          set: { sess: session as unknown as Record<string, unknown>, expire },
        })
        .then(() => callback())
        .catch((err) => callback(err));
    },
    get(sid, callback) {
      db.select()
        .from(sessions)
        .where(eq(sessions.sid, sid))
        .limit(1)
        .then((rows) => {
          const row = rows[0];
          if (!row || row.expire.getTime() < Date.now()) return callback(null, null);
          callback(null, row.sess as never);
        })
        .catch((err) => callback(err));
    },
    destroy(sid, callback) {
      db.delete(sessions)
        .where(eq(sessions.sid, sid))
        .then(() => callback())
        .catch((err) => callback(err));
    },
  };
}

export async function purgeExpiredSessions(db: Db) {
  await db.delete(sessions).where(lt(sessions.expire, new Date()));
}
