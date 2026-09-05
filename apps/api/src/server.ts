import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { runMigrations } from "./db/migrate";
import { startScheduler } from "./jobs";

async function main() {
  const config = loadConfig();
  if (config.isProd) {
    await runMigrations(config.DATABASE_URL);
  }
  const { db, pool } = createDb(config.DATABASE_URL);
  const app = await buildApp({ config, db });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: config.PORT, host: config.HOST });
  startScheduler(app);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
