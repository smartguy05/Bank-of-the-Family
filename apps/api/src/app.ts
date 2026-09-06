import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import session from "@fastify/session";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import fs from "node:fs";
import path from "node:path";
import type { Config } from "./config";
import type { Db } from "./db";
import { AppError } from "./lib/errors";
import { authPlugin } from "./plugins/auth";
import { createPgSessionStore } from "./plugins/session-store";
import { registerRoutes } from "./routes";
import { configurePush } from "./services/push";

export type App = FastifyInstance;

export interface BuildAppOptions {
  config: Config;
  db: Db;
}

export async function buildApp({ config, db }: BuildAppOptions): Promise<App> {
  const app = Fastify({
    logger: config.isTest
      ? false
      : {
          level: config.LOG_LEVEL,
          ...(config.isProd ? {} : { transport: { target: "pino-pretty" } }),
        },
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate("config", config);
  app.decorate("db", db);
  configurePush(config);

  // Several body schemas have every field optional (e.g. createInviteBody, updateAccountBody).
  // A client that has nothing to send may omit the body entirely; treat that the same as `{}`
  // rather than `undefined`, which the zod object schemas would otherwise reject.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const raw = body as string;
    if (!raw) return done(null, {});
    try {
      done(null, JSON.parse(raw));
    } catch (err) {
      done(err as Error, undefined);
    }
  });
  // Same idea when the client sends no body (and so no Content-Type) at all.
  app.addHook("preValidation", async (request) => {
    if (request.body === undefined) request.body = {};
  });

  await app.register(cors, {
    origin: config.isProd ? false : [config.APP_URL, /^http:\/\/localhost:\d+$/],
    credentials: true,
  });
  await app.register(cookie);
  const ttlMs = config.SESSION_TTL_DAYS_PARENT * 24 * 60 * 60 * 1000;
  await app.register(session, {
    secret: config.SESSION_SECRET,
    cookieName: "botf_session",
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.isProd ? true : "auto",
      path: "/",
      maxAge: ttlMs,
    },
    saveUninitialized: false,
    rolling: true,
    store: createPgSessionStore(db, ttlMs),
  });
  await app.register(rateLimit, { global: false });

  await app.register(swagger, {
    openapi: {
      info: { title: "Bank of the Family API", version: "0.1.0" },
      components: {
        securitySchemes: {
          cookieAuth: { type: "apiKey", in: "cookie", name: "botf_session" },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/api/docs" });

  await app.register(authPlugin);

  // Android TWA asset-link verification. Lives outside /api (and outside auth) because Chrome
  // fetches it unauthenticated from the app's public origin root.
  app.get("/.well-known/assetlinks.json", async (_request, reply) => {
    const fingerprints = config.APP_ASSETLINKS_FINGERPRINTS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return reply.type("application/json").send([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: config.ANDROID_PACKAGE_NAME,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ]);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        statusCode: err.statusCode,
        error: err.code,
        message: err.message,
        code: err.code,
      });
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        statusCode: 400,
        error: "VALIDATION",
        code: "VALIDATION",
        message: err.validation.map((v) => `${v.instancePath || "body"} ${v.message}`).join("; "),
      });
    }
    if (isResponseSerializationError(err)) {
      req.log.error({ err }, "response serialization failed");
      return reply.status(500).send({
        statusCode: 500,
        error: "SERIALIZATION",
        code: "SERIALIZATION",
        message: "Response did not match schema",
      });
    }
    const e = err as { statusCode?: number; code?: string; message?: string };
    const statusCode = e.statusCode ?? 500;
    if (statusCode >= 500) req.log.error({ err }, "unhandled error");
    return reply.status(statusCode).send({
      statusCode,
      error: e.code ?? "INTERNAL",
      code: e.code ?? "INTERNAL",
      message: statusCode >= 500 && config.isProd ? "Internal error" : (e.message ?? "Error"),
    });
  });

  await app.register(registerRoutes, { prefix: "/api" });

  // Serve the built web app (production). SPA fallback for non-API routes.
  const webDir = config.WEB_DIST_DIR ?? path.resolve(process.cwd(), "../web/dist");
  if (fs.existsSync(path.join(webDir, "index.html"))) {
    // Wildcard serving resolves files per request (a rebuilt bundle with new hashes is picked
    // up without a restart); missing files fall through to the SPA index below. Hashed assets
    // are immutable, so they get a long cache lifetime; index.html and the service worker
    // must always revalidate.
    await app.register(fastifyStatic, {
      root: webDir,
      prefix: "/",
      setHeaders(res, filePath) {
        if (/[\\/]assets[\\/]/.test(filePath)) {
          void res.header("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          void res.header("Cache-Control", "no-cache");
        }
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/") || req.method !== "GET") {
        return reply
          .status(404)
          .send({ statusCode: 404, error: "NOT_FOUND", code: "NOT_FOUND", message: "Not found" });
      }
      // Requests for missing hashed assets must not receive index.html as JavaScript.
      if (/\.(js|mjs|css|map|png|svg|ico|woff2?|json|webmanifest)$/.test(req.url)) {
        return reply.status(404).send("Not found");
      }
      reply.header("Cache-Control", "no-cache");
      return reply.sendFile("index.html");
    });
  }

  return app;
}
