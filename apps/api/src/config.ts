import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),
  /** Public origin of the web app, used for OIDC redirects, invite links, CORS in dev. */
  APP_URL: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().default("postgres://botf:botf@127.0.0.1:5432/botf"),
  SESSION_SECRET: z.string().min(32).default("dev-only-session-secret-please-change-me-0000"),
  SESSION_TTL_DAYS_PARENT: z.coerce.number().default(7),
  SESSION_TTL_DAYS_CHILD: z.coerce.number().default(30),
  AUTHENTIK_ISSUER: z.string().optional(),
  AUTHENTIK_CLIENT_ID: z.string().optional(),
  AUTHENTIK_CLIENT_SECRET: z.string().optional(),
  AUTHENTIK_PARENT_GROUP: z.string().default("bank-parents"),
  AUTHENTIK_API_URL: z.string().optional(),
  AUTHENTIK_API_TOKEN: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
  APP_ASSETLINKS_FINGERPRINTS: z.string().default(""),
  ANDROID_PACKAGE_NAME: z.string().default("family.bank.app"),
  /** Directory of the built web app to serve at "/" (production). */
  WEB_DIST_DIR: z.string().optional(),
  /** Max child-login attempts per IP per minute (raise for shared NAT or e2e runs). */
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  /** Disable the in-process scheduler (tests, or when running a separate worker). */
  SCHEDULER_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false" && v !== "0"),
  /** Enables POST /api/auth/dev/login (parent upsert without OIDC). Always on in tests. */
  DEV_LOGIN_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
});

export type Config = z.infer<typeof envSchema> & {
  isProd: boolean;
  isTest: boolean;
  oidcEnabled: boolean;
  authentikApiEnabled: boolean;
  pushEnabled: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(env);
  return {
    ...parsed,
    isProd: parsed.NODE_ENV === "production",
    isTest: parsed.NODE_ENV === "test",
    oidcEnabled: Boolean(
      parsed.AUTHENTIK_ISSUER && parsed.AUTHENTIK_CLIENT_ID && parsed.AUTHENTIK_CLIENT_SECRET,
    ),
    authentikApiEnabled: Boolean(parsed.AUTHENTIK_API_URL && parsed.AUTHENTIK_API_TOKEN),
    pushEnabled: Boolean(parsed.VAPID_PUBLIC_KEY && parsed.VAPID_PRIVATE_KEY),
  };
}
