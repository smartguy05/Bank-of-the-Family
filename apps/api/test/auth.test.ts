import type { ChildSummary, Family, Me } from "@botf/shared";
import type { MutableToken } from "oauth2-mock-server";
import { Events, OAuth2Server } from "oauth2-mock-server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cookieFrom, createTestContext, resetDb, type TestContext } from "./helpers";

interface InjectResponse {
  statusCode: number;
  headers: Record<string, unknown>;
  cookies: Array<{ name: string; value: string }>;
  json: () => unknown;
}

async function devLogin(
  ctx: TestContext,
  authentikSub: string,
  displayName = "Parent",
): Promise<{ cookie: string; me: Me }> {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/api/auth/dev/login",
    payload: { authentikSub, displayName },
  });
  expect(res.statusCode).toBe(200);
  return { cookie: cookieFrom(res), me: res.json() as Me };
}

async function createParentWithFamily(
  ctx: TestContext,
  sub = "parent-sub-1",
): Promise<{ cookie: string; family: Family }> {
  const { cookie } = await devLogin(ctx, sub, "Test Parent");
  const familyRes = await ctx.app.inject({
    method: "POST",
    url: "/api/families",
    headers: { cookie },
    payload: { name: "The Test Family" },
  });
  expect(familyRes.statusCode).toBe(200);
  return { cookie, family: familyRes.json() as Family };
}

async function createChildUser(
  ctx: TestContext,
  cookie: string,
  opts: { username: string; pin: string; displayName?: string },
): Promise<ChildSummary> {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/api/children",
    headers: { cookie },
    payload: {
      displayName: opts.displayName ?? "Kiddo",
      username: opts.username,
      pin: opts.pin,
      withSavings: true,
    },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as ChildSummary;
}

describe("dev login", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(async () => {
    await resetDb(ctx.db);
  });

  it("creates a parent and /auth/me returns it", async () => {
    const { cookie, me } = await devLogin(ctx, "dev-sub-1", "Ada Lovelace");
    expect(me.user.role).toBe("parent");
    expect(me.user.displayName).toBe("Ada Lovelace");
    expect(me.family).toBeNull();

    const meRes = await ctx.app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(meRes.statusCode).toBe(200);
    expect((meRes.json() as Me).user.id).toBe(me.user.id);
  });

  it("401s /auth/me when signed out", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
  });
});

describe("child login", () => {
  // A fresh app per test: /auth/child/login is rate-limited per IP, and inject() always uses
  // the same loopback address, so sharing one app across tests would exhaust the limit.
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await createTestContext();
    await resetDb(ctx.db);
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("logs a child in with the right pin", async () => {
    const { cookie } = await createParentWithFamily(ctx);
    await createChildUser(ctx, cookie, { username: "kiddo", pin: "1234" });

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/child/login",
      payload: { username: "kiddo", pin: "1234" },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as Me).user.role).toBe("child");
  });

  it("increments failed attempts and locks after 5", async () => {
    const { cookie } = await createParentWithFamily(ctx, "parent-sub-2");
    await createChildUser(ctx, cookie, { username: "kiddo2", pin: "1234" });

    for (let i = 0; i < 4; i++) {
      const res: InjectResponse = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/child/login",
        payload: { username: "kiddo2", pin: "0000" },
      });
      expect(res.statusCode).toBe(401);
    }
    const fifth = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/child/login",
      payload: { username: "kiddo2", pin: "0000" },
    });
    expect(fifth.statusCode).toBe(423);

    const withCorrectPin = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/child/login",
      payload: { username: "kiddo2", pin: "1234" },
    });
    expect(withCorrectPin.statusCode).toBe(423);
  });

  it("changes the child's pin", async () => {
    const { cookie } = await createParentWithFamily(ctx, "parent-sub-3");
    await createChildUser(ctx, cookie, { username: "kiddo3", pin: "1234" });

    const loginRes = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/child/login",
      payload: { username: "kiddo3", pin: "1234" },
    });
    const childCookie = cookieFrom(loginRes);

    const changeRes = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/child/pin",
      headers: { cookie: childCookie },
      payload: { currentPin: "1234", newPin: "5678" },
    });
    expect(changeRes.statusCode).toBe(200);

    const oldPinRes = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/child/login",
      payload: { username: "kiddo3", pin: "1234" },
    });
    expect(oldPinRes.statusCode).toBe(401);

    const newPinRes = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/child/login",
      payload: { username: "kiddo3", pin: "5678" },
    });
    expect(newPinRes.statusCode).toBe(200);
  });

  it("rejects an inactive child", async () => {
    const { cookie } = await createParentWithFamily(ctx, "parent-sub-4");
    const child = await createChildUser(ctx, cookie, { username: "kiddo4", pin: "1234" });

    const patchRes = await ctx.app.inject({
      method: "PATCH",
      url: `/api/children/${child.user.id}`,
      headers: { cookie },
      payload: { isActive: false },
    });
    expect(patchRes.statusCode).toBe(200);

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/child/login",
      payload: { username: "kiddo4", pin: "1234" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("OIDC login", () => {
  let ctx: TestContext;
  let mock: OAuth2Server;

  beforeAll(async () => {
    mock = new OAuth2Server();
    await mock.issuer.keys.generate("RS256");
    await mock.start(0, "localhost");

    ctx = await createTestContext({
      AUTHENTIK_ISSUER: mock.issuer.url,
      AUTHENTIK_CLIENT_ID: "test-client",
      AUTHENTIK_CLIENT_SECRET: "test-secret",
      AUTHENTIK_PARENT_GROUP: "bank-parents",
      APP_URL: "http://app.test",
    });
  });
  afterAll(async () => {
    await ctx.close();
    await mock.stop();
  });
  afterEach(async () => {
    await resetDb(ctx.db);
  });

  async function withTokenClaims<T>(
    claims: Record<string, unknown>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const handler = (token: MutableToken) => {
      Object.assign(token.payload, claims);
    };
    mock.service.on(Events.BeforeTokenSigning, handler);
    try {
      return await fn();
    } finally {
      mock.service.off(Events.BeforeTokenSigning, handler);
    }
  }

  async function runLoginFlow(): Promise<InjectResponse> {
    const loginRes: InjectResponse = await ctx.app.inject({
      method: "GET",
      url: "/api/auth/oidc/login",
    });
    expect(loginRes.statusCode).toBe(302);
    const authorizeUrl = loginRes.headers.location as string;
    const loginCookie = cookieFrom(loginRes);

    const authRes = await fetch(authorizeUrl, { redirect: "manual" });
    expect(authRes.status).toBeGreaterThanOrEqual(300);
    expect(authRes.status).toBeLessThan(400);
    const callbackLocation = authRes.headers.get("location");
    if (!callbackLocation) throw new Error("mock authorize endpoint did not redirect");
    const callbackUrl = new URL(callbackLocation);

    return ctx.app.inject({
      method: "GET",
      url: `/api/auth/oidc/callback${callbackUrl.search}`,
      headers: { cookie: loginCookie },
    });
  }

  it("returns 503 when OIDC is not configured", async () => {
    const unconfigured = await createTestContext({
      AUTHENTIK_ISSUER: undefined,
      AUTHENTIK_CLIENT_ID: undefined,
      AUTHENTIK_CLIENT_SECRET: undefined,
    });
    const res = await unconfigured.app.inject({ method: "GET", url: "/api/auth/oidc/login" });
    expect(res.statusCode).toBe(503);
    await unconfigured.close();
  });

  it("logs a parent in when they're in the parent group", async () => {
    const res = await withTokenClaims(
      { groups: ["bank-parents"], name: "Ada Lovelace" },
      runLoginFlow,
    );
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("http://app.test/");

    const cookie = cookieFrom(res);
    const meRes = await ctx.app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json()).toMatchObject({ user: { role: "parent", displayName: "Ada Lovelace" } });
  });

  it("redirects with not_a_parent when the user lacks the parent group", async () => {
    const res = await withTokenClaims({ groups: ["some-other-group"] }, runLoginFlow);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("http://app.test/login?error=not_a_parent");
  });
});
