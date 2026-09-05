import { Cron } from "croner";
import { sql } from "drizzle-orm";
import type { App } from "../app";
import type { Db } from "../db";
import { purgeExpiredSessions } from "../plugins/session-store";

/** Arbitrary constant so only one process/instance runs due jobs at a time. */
const SCHEDULER_LOCK_KEY = 727001;

/**
 * Runs all due background work, guarded by a Postgres advisory lock so multiple API instances
 * (or overlapping runs) never do the same work twice.
 *
 * Extension points for future scheduled work (not yet implemented):
 *   - jobs/allowance.ts — post due entries from `allowanceSchedules`.
 *   - jobs/interest.ts  — post monthly interest on savings accounts.
 */
export async function runDueJobs(db: Db): Promise<void> {
  const result = await db.execute(
    sql`select pg_try_advisory_lock(${SCHEDULER_LOCK_KEY}) as locked`,
  );
  const locked = Boolean((result.rows as Array<{ locked: boolean }>)[0]?.locked);
  if (!locked) return;
  try {
    await purgeExpiredSessions(db);
  } finally {
    await db.execute(sql`select pg_advisory_unlock(${SCHEDULER_LOCK_KEY})`);
  }
}

/** Starts the in-process scheduler (every 5 minutes). No-op when SCHEDULER_ENABLED is false. */
export function startScheduler(app: App): Cron | undefined {
  if (!app.config.SCHEDULER_ENABLED) return undefined;
  const job = new Cron("*/5 * * * *", async () => {
    try {
      await runDueJobs(app.db);
      app.log.info("scheduler: ran due jobs");
    } catch (err) {
      app.log.error({ err }, "scheduler: job run failed");
    }
  });
  app.addHook("onClose", async () => {
    job.stop();
  });
  return job;
}
