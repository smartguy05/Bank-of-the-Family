import type { Account, ChildSummary, Notification, SavingsGoal } from "@botf/shared";
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

async function createFamily(ctx: TestContext, cookie: string) {
  await ctx.app.inject({
    method: "POST",
    url: "/api/families",
    headers: { cookie },
    payload: { name: "Goals Family" },
  });
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

async function childLogin(ctx: TestContext, username: string): Promise<string> {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/api/auth/child/login",
    payload: { username, pin: "1234" },
  });
  return cookieFrom(res);
}

describe("savings goals", () => {
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

  it("allocating beyond available funds is rejected with 409, and available balance drops after allocation", async () => {
    const cookie = await devLogin(ctx, "goal-parent-1");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "goalkid1");
    const checking = child.accounts.find((a) => a.type === "checking")!;
    const childCookie = await childLogin(ctx, "goalkid1");

    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 1000, category: "allowance" },
    });

    const goalRes = await ctx.app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { cookie: childCookie },
      payload: { accountId: checking.id, name: "Skateboard", targetMinor: 2000 },
    });
    expect(goalRes.statusCode).toBe(200);
    const goal = goalRes.json() as SavingsGoal;

    const overRes = await ctx.app.inject({
      method: "POST",
      url: `/api/goals/${goal.id}/allocate`,
      headers: { cookie: childCookie },
      payload: { amountMinor: 1500 },
    });
    expect(overRes.statusCode).toBe(409);
    expect((overRes.json() as { code: string }).code).toBe("INSUFFICIENT_FUNDS");

    const okRes = await ctx.app.inject({
      method: "POST",
      url: `/api/goals/${goal.id}/allocate`,
      headers: { cookie: childCookie },
      payload: { amountMinor: 400 },
    });
    expect(okRes.statusCode).toBe(200);
    expect((okRes.json() as SavingsGoal).savedMinor).toBe(400);

    const accountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${checking.id}`,
      headers: { cookie: childCookie },
    });
    const account = accountRes.json() as Account;
    expect(account.balanceMinor).toBe(1000);
    expect(account.availableMinor).toBe(600);
  });

  it("a charge can still dip into earmarked money (ledger checks balance, not available)", async () => {
    const cookie = await devLogin(ctx, "goal-parent-2");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "goalkid2");
    const checking = child.accounts.find((a) => a.type === "checking")!;

    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 1000, category: "allowance" },
    });
    const goalRes = await ctx.app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { cookie },
      payload: { accountId: checking.id, name: "Bike", targetMinor: 5000 },
    });
    const goal = goalRes.json() as SavingsGoal;
    await ctx.app.inject({
      method: "POST",
      url: `/api/goals/${goal.id}/allocate`,
      headers: { cookie },
      payload: { amountMinor: 900 }, // leaves only 100 available
    });

    // A parent charge for more than what's "available" still succeeds — it only checks balance.
    const chargeRes = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/charge",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 500, category: "purchase" },
    });
    expect(chargeRes.statusCode).toBe(200);

    const accountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${checking.id}`,
      headers: { cookie },
    });
    const account = accountRes.json() as Account;
    expect(account.balanceMinor).toBe(500);
    expect(account.availableMinor).toBe(-400); // earmark now exceeds the remaining balance
  });

  it("notifies the goal owner and parents when the goal is first reached, and complete() releases the earmark", async () => {
    const cookie = await devLogin(ctx, "goal-parent-3");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "goalkid3");
    const checking = child.accounts.find((a) => a.type === "checking")!;
    const childCookie = await childLogin(ctx, "goalkid3");

    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 1000, category: "allowance" },
    });
    const goalRes = await ctx.app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { cookie: childCookie },
      payload: { accountId: checking.id, name: "Book", targetMinor: 1000 },
    });
    const goal = goalRes.json() as SavingsGoal;

    const allocateRes = await ctx.app.inject({
      method: "POST",
      url: `/api/goals/${goal.id}/allocate`,
      headers: { cookie: childCookie },
      payload: { amountMinor: 1000 },
    });
    expect(allocateRes.statusCode).toBe(200);
    expect((allocateRes.json() as SavingsGoal).savedMinor).toBe(1000);

    const kidNotifsRes = await ctx.app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { cookie: childCookie },
    });
    const kidNotifs = (kidNotifsRes.json() as { items: Notification[] }).items;
    expect(kidNotifs.some((n) => n.type === "goal_reached")).toBe(true);

    const parentNotifsRes = await ctx.app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { cookie },
    });
    const parentNotifs = (parentNotifsRes.json() as { items: Notification[] }).items;
    expect(parentNotifs.some((n) => n.type === "goal_reached")).toBe(true);

    const completeRes = await ctx.app.inject({
      method: "POST",
      url: `/api/goals/${goal.id}/complete`,
      headers: { cookie: childCookie },
    });
    expect(completeRes.statusCode).toBe(200);
    expect((completeRes.json() as SavingsGoal).completedAt).not.toBeNull();

    const accountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${checking.id}`,
      headers: { cookie: childCookie },
    });
    // Completed goals no longer count toward the earmark.
    expect((accountRes.json() as Account).availableMinor).toBe(1000);
  });

  it("a child cannot see or touch a sibling's goals (404)", async () => {
    const cookie = await devLogin(ctx, "goal-parent-4");
    await createFamily(ctx, cookie);
    const childA = await createChild(ctx, cookie, "goalkidA");
    await createChild(ctx, cookie, "goalkidB");
    const checkingA = childA.accounts.find((a) => a.type === "checking")!;

    const goalRes = await ctx.app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { cookie },
      payload: { accountId: checkingA.id, name: "A's goal", targetMinor: 1000 },
    });
    const goal = goalRes.json() as SavingsGoal;

    const bCookie = await childLogin(ctx, "goalkidB");
    const patchRes = await ctx.app.inject({
      method: "PATCH",
      url: `/api/goals/${goal.id}`,
      headers: { cookie: bCookie },
      payload: { name: "Hijacked" },
    });
    expect(patchRes.statusCode).toBe(404);

    const allocateRes = await ctx.app.inject({
      method: "POST",
      url: `/api/goals/${goal.id}/allocate`,
      headers: { cookie: bCookie },
      payload: { amountMinor: 100 },
    });
    expect(allocateRes.statusCode).toBe(404);

    const listRes = await ctx.app.inject({
      method: "GET",
      url: "/api/goals",
      headers: { cookie: bCookie },
    });
    expect(listRes.json() as SavingsGoal[]).toHaveLength(0);
  });
});
