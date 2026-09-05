import type { Family as FamilyDto } from "@botf/shared";
import { changePinBody, childLoginBody, logoutResponse, meSchema, okResponse } from "@botf/shared";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import * as client from "openid-client";
import { z } from "zod";
import type { Db } from "../db";
import { families, users } from "../db/schema";
import { AppError, forbidden, unauthorized } from "../lib/errors";
import { requireChild } from "../lib/guards";
import { acceptInviteForUser, toFamilyDto } from "../services/families";
import { getOidcConfig, oidcRedirectUri } from "../services/oidc";
import { toUserDto, upsertParentByAuthentikSub } from "../services/users";

const CHILD_LOGIN_MAX_ATTEMPTS = 5;
const CHILD_LOGIN_LOCK_MINUTES = 15;

const devLoginBody = z.object({
  authentikSub: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(1).max(80).default("Dev Parent"),
});

async function loadFamilyDto(db: Db, familyId: string | null): Promise<FamilyDto | null> {
  if (!familyId) return null;
  const [family] = await db.select().from(families).where(eq(families.id, familyId)).limit(1);
  return family ? toFamilyDto(family) : null;
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/auth/oidc/login",
    {
      schema: {
        tags: ["auth"],
        querystring: z.object({
          returnTo: z.string().max(500).optional(),
          invite: z.string().max(64).optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!app.config.oidcEnabled) {
        throw new AppError(503, "OIDC_NOT_CONFIGURED", "OIDC login is not configured");
      }
      const cfg = await getOidcConfig(app.config);
      const codeVerifier = client.randomPKCECodeVerifier();
      const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
      const state = client.randomState();
      const nonce = client.randomNonce();

      const url = client.buildAuthorizationUrl(cfg, {
        redirect_uri: oidcRedirectUri(app.config),
        scope: "openid profile email groups",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state,
        nonce,
      });

      request.session.oidc = { state, codeVerifier, nonce, returnTo: request.query.returnTo };
      if (request.query.invite) request.session.inviteCode = request.query.invite;

      return reply.redirect(url.toString());
    },
  );

  r.get("/auth/oidc/callback", { schema: { tags: ["auth"] } }, async (request, reply) => {
    if (!app.config.oidcEnabled) {
      throw new AppError(503, "OIDC_NOT_CONFIGURED", "OIDC login is not configured");
    }
    const oidcState = request.session.oidc;
    if (!oidcState) {
      return reply.redirect(`${app.config.APP_URL}/login?error=oidc_failed`);
    }
    const returnTo = oidcState.returnTo;
    const inviteCode = request.session.inviteCode;

    try {
      const cfg = await getOidcConfig(app.config);
      const currentUrl = new URL(oidcRedirectUri(app.config));
      const qIndex = request.raw.url?.indexOf("?") ?? -1;
      currentUrl.search = qIndex >= 0 ? request.raw.url!.slice(qIndex + 1) : "";

      const tokens = await client.authorizationCodeGrant(cfg, currentUrl, {
        expectedState: oidcState.state,
        expectedNonce: oidcState.nonce,
        pkceCodeVerifier: oidcState.codeVerifier,
      });
      const claims = tokens.claims();
      if (!claims) throw new Error("OIDC response had no id_token claims");

      const groups = Array.isArray(claims.groups) ? (claims.groups as unknown[]) : [];
      if (!groups.includes(app.config.AUTHENTIK_PARENT_GROUP)) {
        return reply.redirect(`${app.config.APP_URL}/login?error=not_a_parent`);
      }

      const sub = String(claims.sub);
      const displayName =
        (claims.name as string | undefined) ??
        (claims.preferred_username as string | undefined) ??
        (claims.email as string | undefined) ??
        "Parent";
      const user = await upsertParentByAuthentikSub(app.db, { authentikSub: sub, displayName });

      await request.session.regenerate();
      request.session.userId = user.id;
      request.session.authMethod = "oidc";
      if (tokens.id_token) request.session.idToken = tokens.id_token;

      let pendingInviteCode: string | null = null;
      if (inviteCode && !user.familyId) {
        try {
          await acceptInviteForUser(app.db, { code: inviteCode, userId: user.id });
        } catch {
          pendingInviteCode = inviteCode;
        }
      }
      if (pendingInviteCode) request.session.inviteCode = pendingInviteCode;

      const dest =
        returnTo && returnTo.startsWith("/")
          ? `${app.config.APP_URL}${returnTo}`
          : `${app.config.APP_URL}/`;
      return reply.redirect(dest);
    } catch (err) {
      request.log.warn({ err }, "oidc callback failed");
      return reply.redirect(`${app.config.APP_URL}/login?error=oidc_failed`);
    }
  });

  r.post(
    "/auth/logout",
    { schema: { tags: ["auth"], response: { 200: logoutResponse } } },
    async (request, reply) => {
      let redirectTo: string | null = null;
      const idToken = request.session.idToken;
      if (app.config.oidcEnabled && idToken) {
        try {
          const cfg = await getOidcConfig(app.config);
          redirectTo = client
            .buildEndSessionUrl(cfg, {
              id_token_hint: idToken,
              post_logout_redirect_uri: app.config.APP_URL,
            })
            .toString();
        } catch {
          redirectTo = null;
        }
      }
      await request.session.destroy();
      reply.clearCookie("botf_session", { path: "/" });
      return { ok: true as const, redirectTo };
    },
  );

  r.post(
    "/auth/child/login",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: { tags: ["auth"], body: childLoginBody, response: { 200: meSchema } },
    },
    async (request) => {
      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.username, request.body.username))
        .limit(1);
      if (!user || user.role !== "child" || !user.pinHash) {
        throw unauthorized("Invalid username or PIN");
      }
      if (!user.isActive) throw forbidden("This account is inactive");
      if (user.pinLockedUntil && user.pinLockedUntil.getTime() > Date.now()) {
        const minutes = Math.ceil((user.pinLockedUntil.getTime() - Date.now()) / 60000);
        throw new AppError(
          423,
          "PIN_LOCKED",
          `Too many attempts. Try again in ${minutes} minute(s).`,
        );
      }

      const valid = await argon2.verify(user.pinHash, request.body.pin);
      if (!valid) {
        const attempts = user.pinFailedAttempts + 1;
        if (attempts >= CHILD_LOGIN_MAX_ATTEMPTS) {
          await app.db
            .update(users)
            .set({
              pinFailedAttempts: 0,
              pinLockedUntil: new Date(Date.now() + CHILD_LOGIN_LOCK_MINUTES * 60_000),
            })
            .where(eq(users.id, user.id));
          throw new AppError(
            423,
            "PIN_LOCKED",
            `Too many attempts. Try again in ${CHILD_LOGIN_LOCK_MINUTES} minute(s).`,
          );
        }
        await app.db
          .update(users)
          .set({ pinFailedAttempts: attempts })
          .where(eq(users.id, user.id));
        throw unauthorized("Invalid username or PIN");
      }

      await app.db
        .update(users)
        .set({ pinFailedAttempts: 0, pinLockedUntil: null })
        .where(eq(users.id, user.id));

      await request.session.regenerate();
      request.session.userId = user.id;
      request.session.authMethod = "pin";
      request.session.cookie.maxAge = app.config.SESSION_TTL_DAYS_CHILD * 24 * 60 * 60 * 1000;

      const family = await loadFamilyDto(app.db, user.familyId);
      return { user: toUserDto(user), family, pendingInviteCode: null };
    },
  );

  r.get(
    "/auth/me",
    { schema: { tags: ["auth"], response: { 200: meSchema } } },
    async (request) => {
      if (!request.currentUser) throw unauthorized();
      return {
        user: toUserDto(request.currentUser),
        family: request.family ? toFamilyDto(request.family) : null,
        pendingInviteCode: request.session.inviteCode ?? null,
      };
    },
  );

  r.post(
    "/auth/child/pin",
    {
      preHandler: [requireChild],
      schema: { tags: ["auth"], body: changePinBody, response: { 200: okResponse } },
    },
    async (request) => {
      const user = request.currentUser!;
      if (!user.pinHash || !(await argon2.verify(user.pinHash, request.body.currentPin))) {
        throw unauthorized("Current PIN is incorrect");
      }
      const pinHash = await argon2.hash(request.body.newPin);
      await app.db
        .update(users)
        .set({ pinHash, pinFailedAttempts: 0, pinLockedUntil: null })
        .where(eq(users.id, user.id));
      return { ok: true as const };
    },
  );

  if (app.config.isTest || app.config.DEV_LOGIN_ENABLED) {
    r.post(
      "/auth/dev/login",
      { schema: { tags: ["auth"], body: devLoginBody, response: { 200: meSchema } } },
      async (request) => {
        const user = await upsertParentByAuthentikSub(app.db, request.body);
        await request.session.regenerate();
        request.session.userId = user.id;
        request.session.authMethod = "oidc";
        const family = await loadFamilyDto(app.db, user.familyId);
        return {
          user: toUserDto(user),
          family,
          pendingInviteCode: request.session.inviteCode ?? null,
        };
      },
    );
  }
};
