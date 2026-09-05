import type { Account, ChildSummary, Transaction } from "@botf/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { accounts } from "../src/db/schema";
import { postMonthlyInterest } from "../src/jobs/interest";
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
    payload: { name: "Interest Family", timezone: "America/Chicago" },
  });
}

async function createChildWithSavings(
  ctx: TestContext,
  cookie: string,
  username: string,
  savingsInterestRateBps: number,
): Promise<ChildSummary> {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/api/children",
    headers: { cookie },
    payload: {
      displayName: username,
      username,
      pin: "1234",
      withSavings: true,
      savingsInterestRateBps,
    },
  });
  return res.json() as ChildSummary;
}

/** Backdates an account's createdAt so it's "old enough" to be eligible for interest this month. */
async function backdateAccountCreation(ctx: TestContext, accountId: string, monthsAgo: number) {
  const past = new Date();
  past.setUTCMonth(past.getUTCMonth() - monthsAgo);
  await ctx.db.update(accounts).set({ createdAt: past }).where(eq(accounts.id, accountId));
}

describe("interest job", () => {
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

  it("posts interest once, reruns in the same month post nothing, next month posts again", async () => {
    const cookie = await devLogin(ctx, "interest-parent-1");
    await createFamily(ctx, cookie);
    const child = await createChildWithSavings(ctx, cookie, "kidInt1", 1200); // 12% APR
    const savings = child.accounts.find((a) => a.type === "savings")!;
    await backdateAccountCreation(ctx, savings.id, 2);

    // Give it a balance to earn interest on.
    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: savings.id, amountMinor: 100_00, category: "gift" },
    });

    const now = new Date();
    await postMonthlyInterest(ctx.db, now);

    const afterFirst = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${savings.id}`,
      headers: { cookie },
    });
    const balanceAfterFirst = (afterFirst.json() as Account).balanceMinor;
    // 12% / 12 = 1% of 10000 = 100.
    expect(balanceAfterFirst).toBe(100_00 + 100);
    expect((afterFirst.json() as Account).lastInterestPostedAt).not.toBeNull();

    // Rerunning within the same month posts nothing more.
    await postMonthlyInterest(ctx.db, now);
    const afterRerun = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${savings.id}`,
      headers: { cookie },
    });
    expect((afterRerun.json() as Account).balanceMinor).toBe(balanceAfterFirst);

    // Next month, it posts again.
    const nextMonth = new Date(now);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    await postMonthlyInterest(ctx.db, nextMonth);
    const afterNextMonth = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${savings.id}`,
      headers: { cookie },
    });
    expect((afterNextMonth.json() as Account).balanceMinor).toBeGreaterThan(balanceAfterFirst);

    const txRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${savings.id}/transactions`,
      headers: { cookie },
    });
    const interestEntries = (txRes.json() as { items: Transaction[] }).items.filter(
      (t) => t.kind === "interest",
    );
    expect(interestEntries).toHaveLength(2);
  });

  it("skips a zero-rate account entirely", async () => {
    const cookie = await devLogin(ctx, "interest-parent-2");
    await createFamily(ctx, cookie);
    const child = await createChildWithSavings(ctx, cookie, "kidInt2", 0);
    const savings = child.accounts.find((a) => a.type === "savings")!;
    await backdateAccountCreation(ctx, savings.id, 2);
    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: savings.id, amountMinor: 5000, category: "gift" },
    });

    await postMonthlyInterest(ctx.db, new Date());

    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${savings.id}`,
      headers: { cookie },
    });
    const account = res.json() as Account;
    expect(account.balanceMinor).toBe(5000);
    expect(account.lastInterestPostedAt).toBeNull();
  });

  it("skips an account created this month even with a positive rate and balance", async () => {
    const cookie = await devLogin(ctx, "interest-parent-3");
    await createFamily(ctx, cookie);
    const child = await createChildWithSavings(ctx, cookie, "kidInt3", 1200);
    const savings = child.accounts.find((a) => a.type === "savings")!;
    // Not backdated: created "this month".
    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: savings.id, amountMinor: 10000, category: "gift" },
    });

    await postMonthlyInterest(ctx.db, new Date());

    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${savings.id}`,
      headers: { cookie },
    });
    expect((res.json() as Account).balanceMinor).toBe(10000);
  });
});
