import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "../src/db/migrate";

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? "postgres://botf:botf@127.0.0.1:5432/botf_test";

/** Ensures the test DB exists and is migrated before the suite runs. */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = "/postgres";
  try {
    execSync(
      `psql "${adminUrl.toString()}" -tc "SELECT 1 FROM pg_database WHERE datname='${dbName}'" | grep -q 1 || psql "${adminUrl.toString()}" -c "CREATE DATABASE ${dbName}"`,
      { stdio: "ignore", shell: "/bin/sh" },
    );
  } catch {
    // psql may be unavailable (CI service already created the DB); continue.
  }
  const migrations = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");
  await runMigrations(TEST_DATABASE_URL, migrations);
}
