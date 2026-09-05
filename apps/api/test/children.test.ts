import type { ChildSummary, Me } from "@botf/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { cookieFrom, createTestContext, resetDb, type TestContext } from "./helpers";

async function createParentWithFamily(ctx: TestContext, sub: string, familyName: string) {
  const loginRes = await ctx.app.inject({
    method: "POST",
    url: "/api/auth/dev/login",
    payload: { authentikSub: sub, displayName: "Parent" },
  });
  const cookie = cookieFrom(loginRes);
  await ctx.app.inject({
    method: "POST",
    url: "/api/families",
    headers: { cookie },
    payload: { name: familyName },
  });
  return cookie;
}

describe("children", () => {
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

  it("creates a checking and savings account for a new child", async () => {
    const cookie = await createParentWithFamily(ctx, "children-parent-1", "Family One");

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/children",
      headers: { cookie },
      payload: { displayName: "Riley", username: "riley", pin: "1234", withSavings: true },
    });
    expect(res.statusCode).toBe(200);
    const child = res.json() as ChildSummary;
    expect(child.user.displayName).toBe("Riley");
    expect(child.accounts).toHaveLength(2);
    expect(child.accounts.map((a) => a.type).sort()).toEqual(["checking", "savings"]);
    expect(child.totalMinor).toBe(0);
  });

  it("without savings creates only a checking account", async () => {
    const cookie = await createParentWithFamily(ctx, "children-parent-2", "Family Two");
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/children",
      headers: { cookie },
      payload: { displayName: "Sam", username: "sam", pin: "1234", withSavings: false },
    });
    const child = res.json() as ChildSummary;
    expect(child.accounts).toHaveLength(1);
    expect(child.accounts[0]!.type).toBe("checking");
  });

  it("rejects a duplicate username with 409", async () => {
    const cookie = await createParentWithFamily(ctx, "children-parent-3", "Family Three");
    await ctx.app.inject({
      method: "POST",
      url: "/api/children",
      headers: { cookie },
      payload: { displayName: "Jordan", username: "jordan", pin: "1234" },
    });
    const dup = await ctx.app.inject({
      method: "POST",
      url: "/api/children",
      headers: { cookie },
      payload: { displayName: "Jordan Two", username: "jordan", pin: "5678" },
    });
    expect(dup.statusCode).toBe(409);
    expect((dup.json() as { code: string }).code).toBe("USERNAME_TAKEN");
  });

  it("logs in with the pin set at creation", async () => {
    const cookie = await createParentWithFamily(ctx, "children-parent-4", "Family Four");
    await ctx.app.inject({
      method: "POST",
      url: "/api/children",
      headers: { cookie },
      payload: { displayName: "Casey", username: "casey", pin: "4321" },
    });
    const loginRes = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/child/login",
      payload: { username: "casey", pin: "4321" },
    });
    expect(loginRes.statusCode).toBe(200);
    expect((loginRes.json() as Me).user.username).toBe("casey");
  });

  it("resetting the pin clears the lock and failed attempts", async () => {
    const cookie = await createParentWithFamily(ctx, "children-parent-5", "Family Five");
    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/children",
      headers: { cookie },
      payload: { displayName: "Drew", username: "drew", pin: "1111" },
    });
    const child = createRes.json() as ChildSummary;

    for (let i = 0; i < 5; i++) {
      await ctx.app.inject({
        method: "POST",
        url: "/api/auth/child/login",
        payload: { username: "drew", pin: "0000" },
      });
    }
    const lockedRes = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/child/login",
      payload: { username: "drew", pin: "1111" },
    });
    expect(lockedRes.statusCode).toBe(423);

    const resetRes = await ctx.app.inject({
      method: "POST",
      url: `/api/children/${child.user.id}/pin`,
      headers: { cookie },
      payload: { pin: "9999" },
    });
    expect(resetRes.statusCode).toBe(200);

    const unlockedRes = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/child/login",
      payload: { username: "drew", pin: "9999" },
    });
    expect(unlockedRes.statusCode).toBe(200);
  });

  it("hides a child from a parent in a different family (404)", async () => {
    const cookieA = await createParentWithFamily(ctx, "children-parent-6", "Family Six");
    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/children",
      headers: { cookie: cookieA },
      payload: { displayName: "Alex", username: "alex", pin: "1234" },
    });
    const child = createRes.json() as ChildSummary;

    const cookieB = await createParentWithFamily(ctx, "children-parent-7", "Family Seven");
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/children/${child.user.id}`,
      headers: { cookie: cookieB },
    });
    expect(res.statusCode).toBe(404);
  });
});
