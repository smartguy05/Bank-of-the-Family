import { defineConfig } from "tsup";

export default defineConfig({
  entry: { server: "src/server.ts", migrate: "src/db/migrate.ts", seed: "src/db/seed.ts" },
  format: ["esm"],
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  // bundle workspace packages; keep npm deps external
  noExternal: ["@botf/shared"],
});
