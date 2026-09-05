import type { ChildHome, ChildSummary, ParentDashboard } from "@botf/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { cookieFrom, createTestContext, resetDb, type TestContext } from "./helpers";

async function devLogin(ctx: TestContext, sub: string) {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/api/auth/dev/login",
    payload: { authentikSub: sub, displayName: "Parent" },
  });
  return cookieFrom(res);
}

async function createChild(
  ctx: TestContext,
  cookie: string,
  username: string,
): Promise<ChildSummary> {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/api/children",
    headers: { cookie },
    payload: { displayName: username, username, pin: "1234", withSavings: true },
  });
  return res.json() as ChildSummary;
}

describe("dashboard", () => {
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

  it("totals balances and lists recent activity for the parent", async () => {
    const cookie = await devLogin(ctx, "dash-parent-1");
    await ctx.app.inject({
      method: "POST",
      url: "/api/families",
      headers: { cookie },
      payload: { name: "Dashboard Family" },
    });
    const childA = await createChild(ctx, cookie, "dasha");
    const childB = await createChild(ctx, cookie, "dashb");

    const checkingA = childA.accounts.find((a) => a.type === "checking")!;
    const checkingB = childB.accounts.find((a) => a.type === "checking")!;

    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: checkingA.id, amountMinor: 500, category: "allowance" },
    });
    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: checkingB.id, amountMinor: 700, category: "allowance" },
    });

    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/dashboard/parent",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const dashboard = res.json() as ParentDashboard;
    expect(dashboard.totalMinor).toBe(1200);
    expect(dashboard.children).toHaveLength(2);
    expect(dashboard.pendingRequestCount).toBe(0);
    expect(dashboard.recentTransactions.length).toBeGreaterThanOrEqual(2);
  });

  it("builds a child's home feed", async () => {
    const cookie = await devLogin(ctx, "dash-parent-2");
    await ctx.app.inject({
      method: "POST",
      url: "/api/families",
      headers: { cookie },
      payload: { name: "Child Home Family" },
    });
    const child = await createChild(ctx, cookie, "dashc");
    const checking = child.accounts.find((a) => a.type === "checking")!;

    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 300, category: "allowance" },
    });

    const loginRes = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/child/login",
      payload: { username: "dashc", pin: "1234" },
    });
    const childCookie = cookieFrom(loginRes);

    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/dashboard/child",
      headers: { cookie: childCookie },
    });
    expect(res.statusCode).toBe(200);
    const home = res.json() as ChildHome;
    expect(home.totalMinor).toBe(300);
    expect(home.accounts).toHaveLength(2);
    expect(home.recentTransactions.length).toBeGreaterThanOrEqual(1);
    expect(home.pendingRequestCount).toBe(0);
    // The parent's deposit notifies the child (actor !== account owner).
    expect(home.unreadNotifications).toBe(1);
    expect(home.parentIds).toHaveLength(1);
  });
});
