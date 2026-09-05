import { sql } from "drizzle-orm";
import { buildApp, type App } from "../src/app";
import { loadConfig, type Config } from "../src/config";
import { createDb, type Db } from "../src/db";
import { TEST_DATABASE_URL } from "./global-setup";

export interface TestContext {
  app: App;
  db: Db;
  config: Config;
  close: () => Promise<void>;
}

export function testConfig(overrides: Partial<NodeJS.ProcessEnv> = {}): Config {
  return loadConfig({
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: TEST_DATABASE_URL,
    SESSION_SECRET: "test-session-secret-test-session-secret-0000",
    SCHEDULER_ENABLED: "false",
    ...overrides,
  });
}

export async function createTestContext(
  env: Partial<NodeJS.ProcessEnv> = {},
): Promise<TestContext> {
  const config = testConfig(env);
  const { db, pool } = createDb(config.DATABASE_URL);
  const app = await buildApp({ config, db });
  await app.ready();
  return {
    app,
    db,
    config,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}

/** Wipe all family-scoped data between tests (order-independent thanks to cascades). */
export async function resetDb(db: Db) {
  await db.execute(
    sql`TRUNCATE TABLE families, users, sessions, audit_log RESTART IDENTITY CASCADE`,
  );
}

/** Extract the session cookie from a login response for subsequent requests. */
export function cookieFrom(res: { cookies: Array<{ name: string; value: string }> }): string {
  const c = res.cookies.find((x) => x.name === "botf_session");
  if (!c) throw new Error("no session cookie in response");
  return `${c.name}=${c.value}`;
}
