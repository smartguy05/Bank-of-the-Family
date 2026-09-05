import type { ChildSummary, Statement } from "@botf/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { accounts } from "../src/db/schema";
import { charge, deposit } from "../src/services/ledger";
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
  const res = await ctx.app.inject({
    method: "POST",
    url: "/api/families",
    headers: { cookie },
    payload: { name: "Statement Family", timezone: "America/Chicago" },
  });
  return res.json() as { id: string };
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
    payload: { displayName: username, username, pin: "1234", withSavings: false },
  });
  return res.json() as ChildSummary;
}

describe("statements", () => {
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

  it("computes opening/closing balances across two calendar months, and exports a matching csv", async () => {
    const cookie = await devLogin(ctx, "stmt-parent-1");
    const family = await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "stmtkid1");
    const checking = child.accounts.find((a) => a.type === "checking")!;

    // Backdate the account so both target months are "in range" for listing periods.
    await ctx.db
      .update(accounts)
      .set({ createdAt: new Date("2024-01-01T12:00:00Z") })
      .where(eq(accounts.id, checking.id));

    // January: two credits, no debits. Opening balance is 0 (no prior history).
    await deposit(ctx.db, {
      familyId: family.id,
      accountId: checking.id,
      amountMinor: 1000,
      category: "allowance",
      memo: "Week 1",
      createdByUserId: null,
      postedAt: new Date("2024-01-05T12:00:00Z"),
    });
    await deposit(ctx.db, {
      familyId: family.id,
      accountId: checking.id,
      amountMinor: 500,
      category: "gift",
      memo: "Birthday",
      createdByUserId: null,
      postedAt: new Date("2024-01-20T12:00:00Z"),
    });
    // February: one debit. Opening balance should carry over January's closing balance.
    await charge(ctx.db, {
      familyId: family.id,
      accountId: checking.id,
      amountMinor: 300,
      category: "purchase",
      memo: "Toy",
      createdByUserId: null,
      postedAt: new Date("2024-02-10T12:00:00Z"),
    });

    const periodsRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${checking.id}/statements`,
      headers: { cookie },
    });
    expect(periodsRes.statusCode).toBe(200);
    const periods = (periodsRes.json() as { periods: string[] }).periods;
    expect(periods).toContain("2024-01");
    expect(periods).toContain("2024-02");

    const janRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${checking.id}/statements/2024-01`,
      headers: { cookie },
    });
    expect(janRes.statusCode).toBe(200);
    const jan = janRes.json() as Statement;
    expect(jan.openingBalanceMinor).toBe(0);
    expect(jan.totalCreditsMinor).toBe(1500);
    expect(jan.totalDebitsMinor).toBe(0);
    expect(jan.closingBalanceMinor).toBe(1500);
    expect(jan.transactionCount).toBe(2);

    const febRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${checking.id}/statements/2024-02`,
      headers: { cookie },
    });
    expect(febRes.statusCode).toBe(200);
    const feb = febRes.json() as Statement;
    expect(feb.openingBalanceMinor).toBe(1500);
    expect(feb.totalDebitsMinor).toBe(300);
    expect(feb.closingBalanceMinor).toBe(1200);

    const csvRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${checking.id}/statements/2024-01/csv`,
      headers: { cookie },
    });
    expect(csvRes.statusCode).toBe(200);
    expect(csvRes.headers["content-type"]).toContain("text/csv");
    expect(csvRes.headers["content-disposition"]).toContain("statement-");
    const lines = csvRes.body.trim().split("\n");
    expect(lines[0]).toBe("Date,Description,Category,Kind,Amount,Balance");
    expect(lines.length).toBe(1 + jan.transactionCount);
  });

  it("a child can only see statements for their own account", async () => {
    const cookie = await devLogin(ctx, "stmt-parent-2");
    await createFamily(ctx, cookie);
    const childA = await createChild(ctx, cookie, "stmtkidA");
    await createChild(ctx, cookie, "stmtkidB");
    const checkingA = childA.accounts.find((a) => a.type === "checking")!;

    const bLoginRes = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/child/login",
      payload: { username: "stmtkidB", pin: "1234" },
    });
    const bCookie = cookieFrom(bLoginRes);

    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${checkingA.id}/statements`,
      headers: { cookie: bCookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
