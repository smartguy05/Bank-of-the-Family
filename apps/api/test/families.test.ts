import type { Family, FamilyInvite, InvitePreview, Me } from "@botf/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { familyInvites } from "../src/db/schema";
import { cookieFrom, createTestContext, resetDb, type TestContext } from "./helpers";

async function devLogin(ctx: TestContext, authentikSub: string, displayName = "Parent") {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/api/auth/dev/login",
    payload: { authentikSub, displayName },
  });
  expect(res.statusCode).toBe(200);
  return { cookie: cookieFrom(res), me: res.json() as Me };
}

describe("families", () => {
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

  it("lets a parent create a family, and rejects a second one", async () => {
    const { cookie } = await devLogin(ctx, "family-parent-1");

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/families",
      headers: { cookie },
      payload: { name: "The Testersons" },
    });
    expect(res.statusCode).toBe(200);
    const family = res.json() as Family;
    expect(family.name).toBe("The Testersons");
    expect(family.currencyCode).toBe("USD");

    const again = await ctx.app.inject({
      method: "POST",
      url: "/api/families",
      headers: { cookie },
      payload: { name: "Another Family" },
    });
    expect(again.statusCode).toBe(409);
    expect((again.json() as { code: string }).code).toBe("FAMILY_EXISTS");
  });

  it("validates currency and timezone on update", async () => {
    const { cookie } = await devLogin(ctx, "family-parent-2");
    await ctx.app.inject({
      method: "POST",
      url: "/api/families",
      headers: { cookie },
      payload: { name: "Currency Family" },
    });

    const badCurrency = await ctx.app.inject({
      method: "PATCH",
      url: "/api/families/current",
      headers: { cookie },
      payload: { currencyCode: "ZZZ" },
    });
    expect(badCurrency.statusCode).toBe(400);
    expect((badCurrency.json() as { code: string }).code).toBe("INVALID_CURRENCY");

    const badTimezone = await ctx.app.inject({
      method: "PATCH",
      url: "/api/families/current",
      headers: { cookie },
      payload: { timezone: "Not/A_Zone" },
    });
    expect(badTimezone.statusCode).toBe(400);
    expect((badTimezone.json() as { code: string }).code).toBe("INVALID_TIMEZONE");

    const good = await ctx.app.inject({
      method: "PATCH",
      url: "/api/families/current",
      headers: { cookie },
      payload: { currencyCode: "eur", timezone: "Europe/Paris" },
    });
    expect(good.statusCode).toBe(200);
    expect((good.json() as Family).currencyCode).toBe("EUR");
  });

  it("previews, then accepts, an invite; expired invites are rejected", async () => {
    const { cookie: parentCookie } = await devLogin(ctx, "family-parent-3");
    await ctx.app.inject({
      method: "POST",
      url: "/api/families",
      headers: { cookie: parentCookie },
      payload: { name: "Inviting Family" },
    });

    const inviteRes = await ctx.app.inject({
      method: "POST",
      url: "/api/families/current/invites",
      headers: { cookie: parentCookie },
      payload: { inviteeName: "Co-Parent" },
    });
    expect(inviteRes.statusCode).toBe(200);
    const invite = inviteRes.json() as FamilyInvite;
    expect(invite.code).toHaveLength(10);

    const previewRes = await ctx.app.inject({ method: "GET", url: `/api/invites/${invite.code}` });
    expect(previewRes.statusCode).toBe(200);
    const preview = previewRes.json() as InvitePreview;
    expect(preview.valid).toBe(true);
    expect(preview.familyName).toBe("Inviting Family");

    const { cookie: secondParentCookie } = await devLogin(ctx, "family-parent-4", "Co-Parent");
    const acceptRes = await ctx.app.inject({
      method: "POST",
      url: `/api/invites/${invite.code}/accept`,
      headers: { cookie: secondParentCookie },
    });
    expect(acceptRes.statusCode).toBe(200);
    const me = acceptRes.json() as Me;
    expect(me.family?.name).toBe("Inviting Family");

    // Now expire another invite and confirm it's rejected.
    const secondInviteRes = await ctx.app.inject({
      method: "POST",
      url: "/api/families/current/invites",
      headers: { cookie: parentCookie },
    });
    const secondInvite = secondInviteRes.json() as FamilyInvite;
    await ctx.db
      .update(familyInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(familyInvites.id, secondInvite.id));

    const expiredPreview = await ctx.app.inject({
      method: "GET",
      url: `/api/invites/${secondInvite.code}`,
    });
    expect((expiredPreview.json() as InvitePreview).valid).toBe(false);

    const { cookie: thirdParentCookie } = await devLogin(ctx, "family-parent-5");
    const expiredAccept = await ctx.app.inject({
      method: "POST",
      url: `/api/invites/${secondInvite.code}/accept`,
      headers: { cookie: thirdParentCookie },
    });
    expect(expiredAccept.statusCode).toBe(410);
    expect((expiredAccept.json() as { code: string }).code).toBe("INVITE_INVALID");
  });

  it("returns 404 for an unknown invite code", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/invites/does-not-exist" });
    expect(res.statusCode).toBe(404);
  });

  it("registers a new Authentik user via invite using a stubbed fetch", async () => {
    const { cookie } = await devLogin(ctx, "family-parent-6");
    await ctx.app.inject({
      method: "POST",
      url: "/api/families",
      headers: { cookie },
      payload: { name: "Authentik Family" },
    });
    const inviteRes = await ctx.app.inject({
      method: "POST",
      url: "/api/families/current/invites",
      headers: { cookie },
    });
    const invite = inviteRes.json() as FamilyInvite;

    const withApi = await createTestContext({
      AUTHENTIK_API_URL: "https://authentik.example.test/api/v3",
      AUTHENTIK_API_TOKEN: "test-token",
      AUTHENTIK_PARENT_GROUP: "bank-parents",
    });

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchStub = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      calls.push({ url: href, init });
      if (href.includes("/core/groups/") && !href.includes("add_user")) {
        return new Response(JSON.stringify({ results: [{ pk: "group-1" }] }), { status: 200 });
      }
      if (href.endsWith("/core/users/") && init?.method === "POST") {
        return new Response(JSON.stringify({ pk: "user-42" }), { status: 201 });
      }
      if (href.includes("/set_password/")) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected fetch: ${href}`);
    });

    // Monkey-patch global fetch since the route wires the real `fetch` by default; the injectable
    // fetchImpl parameter is exercised directly against the service in a focused way here too.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchStub as unknown as typeof fetch;
    try {
      const registerRes = await withApi.app.inject({
        method: "POST",
        url: `/api/invites/${invite.code}/register`,
        payload: {
          username: "newparent",
          name: "New Parent",
          email: "new@example.com",
          password: "supersecret1",
        },
      });
      expect(registerRes.statusCode).toBe(200);
      expect(registerRes.json()).toMatchObject({
        ok: true,
        loginUrl: `/api/auth/oidc/login?invite=${invite.code}`,
      });
      expect(calls.some((c) => c.url.includes("/core/groups/"))).toBe(true);
      expect(calls.some((c) => c.url.endsWith("/core/users/"))).toBe(true);
      expect(calls.some((c) => c.url.includes("/set_password/"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      await withApi.close();
    }
  });

  it("returns 503 for register-via-invite when Authentik API is not configured", async () => {
    const { cookie } = await devLogin(ctx, "family-parent-7");
    await ctx.app.inject({
      method: "POST",
      url: "/api/families",
      headers: { cookie },
      payload: { name: "No API Family" },
    });
    const inviteRes = await ctx.app.inject({
      method: "POST",
      url: "/api/families/current/invites",
      headers: { cookie },
    });
    const invite = inviteRes.json() as FamilyInvite;

    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/invites/${invite.code}/register`,
      payload: { username: "someone", name: "Someone", password: "supersecret1" },
    });
    expect(res.statusCode).toBe(503);
    expect((res.json() as { code: string }).code).toBe("AUTHENTIK_API_NOT_CONFIGURED");
  });
});
