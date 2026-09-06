import type { Account, ChildSummary, Family, Transaction, TransferResult } from "@botf/shared";
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

async function createFamily(
  ctx: TestContext,
  cookie: string,
  overrides: Partial<{ name: string; allowOverdraft: boolean }> = {},
): Promise<Family> {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/api/families",
    headers: { cookie },
    payload: { name: overrides.name ?? "Ledger Family" },
  });
  const family = res.json() as Family;
  if (overrides.allowOverdraft) {
    const patched = await ctx.app.inject({
      method: "PATCH",
      url: "/api/families/current",
      headers: { cookie },
      payload: { allowOverdraft: true },
    });
    return patched.json() as Family;
  }
  return family;
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

async function childLoginCookie(ctx: TestContext, username: string): Promise<string> {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/api/auth/child/login",
    payload: { username, pin: "1234" },
  });
  return cookieFrom(res);
}

describe("ledger", () => {
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

  it("deposits and charges keep a running balance", async () => {
    const cookie = await devLogin(ctx, "ledger-parent-1");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "kid1");
    const checking = child.accounts.find((a) => a.type === "checking")!;

    const depositRes = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 1000, category: "allowance", memo: "Week 1" },
    });
    expect(depositRes.statusCode).toBe(200);
    const deposit = depositRes.json() as Transaction;
    expect(deposit.amountMinor).toBe(1000);
    expect(deposit.runningBalanceMinor).toBe(1000);

    const chargeRes = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/charge",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 300, category: "purchase", memo: "Toy" },
    });
    expect(chargeRes.statusCode).toBe(200);
    const charge = chargeRes.json() as Transaction;
    expect(charge.amountMinor).toBe(-300);
    expect(charge.runningBalanceMinor).toBe(700);

    const accountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${checking.id}`,
      headers: { cookie },
    });
    expect((accountRes.json() as Account).balanceMinor).toBe(700);
  });

  it("rejects a charge beyond the balance with 409", async () => {
    const cookie = await devLogin(ctx, "ledger-parent-2");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "kid2");
    const checking = child.accounts.find((a) => a.type === "checking")!;

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/charge",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 500, category: "purchase" },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe("INSUFFICIENT_FUNDS");
  });

  it("allows a negative balance when the family allows overdraft", async () => {
    const cookie = await devLogin(ctx, "ledger-parent-3");
    await createFamily(ctx, cookie, { allowOverdraft: true });
    const child = await createChild(ctx, cookie, "kid3");
    const checking = child.accounts.find((a) => a.type === "checking")!;

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/charge",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 500, category: "purchase" },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as Transaction).runningBalanceMinor).toBe(-500);
  });

  it("transfers create linked legs and correct balances", async () => {
    const cookie = await devLogin(ctx, "ledger-parent-4");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "kid4");
    const checking = child.accounts.find((a) => a.type === "checking")!;
    const savings = child.accounts.find((a) => a.type === "savings")!;

    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 1000, category: "allowance" },
    });

    const transferRes = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/transfer",
      headers: { cookie },
      payload: {
        fromAccountId: checking.id,
        toAccountId: savings.id,
        amountMinor: 400,
        memo: "Save up",
      },
    });
    expect(transferRes.statusCode).toBe(200);
    const result = transferRes.json() as TransferResult;
    expect(result.out.amountMinor).toBe(-400);
    expect(result.out.runningBalanceMinor).toBe(600);
    expect(result.in.amountMinor).toBe(400);
    expect(result.in.runningBalanceMinor).toBe(400);
    expect(result.out.relatedTransactionId).toBe(result.in.id);
    expect(result.in.relatedTransactionId).toBe(result.out.id);
    expect(result.in.counterpartyAccountId).toBe(checking.id);
    expect(result.out.counterpartyAccountId).toBe(savings.id);
  });

  it("rejects a transfer to the same account with 400", async () => {
    const cookie = await devLogin(ctx, "ledger-parent-5");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "kid5");
    const checking = child.accounts.find((a) => a.type === "checking")!;

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/transfer",
      headers: { cookie },
      payload: { fromAccountId: checking.id, toAccountId: checking.id, amountMinor: 100 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("reversal restores the balance and marks the original; double reversal 409s", async () => {
    const cookie = await devLogin(ctx, "ledger-parent-6");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "kid6");
    const checking = child.accounts.find((a) => a.type === "checking")!;

    const depositRes = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 1000, category: "allowance" },
    });
    const deposit = depositRes.json() as Transaction;

    const reverseRes = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/reverse",
      headers: { cookie },
      payload: { transactionId: deposit.id, memo: "Mistake" },
    });
    expect(reverseRes.statusCode).toBe(200);
    const reversal = reverseRes.json() as Transaction;
    expect(reversal.amountMinor).toBe(-1000);
    expect(reversal.runningBalanceMinor).toBe(0);

    const accountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${checking.id}`,
      headers: { cookie },
    });
    expect((accountRes.json() as Account).balanceMinor).toBe(0);

    const doubleReverseRes = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/reverse",
      headers: { cookie },
      payload: { transactionId: deposit.id },
    });
    expect(doubleReverseRes.statusCode).toBe(409);
    expect((doubleReverseRes.json() as { code: string }).code).toBe("ALREADY_REVERSED");
  });

  it("an idempotency key returns the same row on retry", async () => {
    const cookie = await devLogin(ctx, "ledger-parent-7");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "kid7");
    const checking = child.accounts.find((a) => a.type === "checking")!;

    const payload = {
      accountId: checking.id,
      amountMinor: 250,
      category: "gift",
      idempotencyKey: "same-key-1",
    };
    const first = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload,
    });
    const second = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect((first.json() as Transaction).id).toBe((second.json() as Transaction).id);

    const accountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${checking.id}`,
      headers: { cookie },
    });
    expect((accountRes.json() as Account).balanceMinor).toBe(250);
  });

  it("paginates transactions with a cursor across pages", async () => {
    const cookie = await devLogin(ctx, "ledger-parent-8");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "kid8");
    const checking = child.accounts.find((a) => a.type === "checking")!;

    for (let i = 0; i < 7; i++) {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/api/transactions/deposit",
        headers: { cookie },
        payload: { accountId: checking.id, amountMinor: 10 + i, category: "other" },
      });
      expect(res.statusCode).toBe(200);
    }

    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    do {
      const url = `/api/accounts/${checking.id}/transactions?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await ctx.app.inject({ method: "GET", url, headers: { cookie } });
      expect(res.statusCode).toBe(200);
      const page = res.json() as { items: Transaction[]; nextCursor: string | null };
      for (const item of page.items) seen.add(item.id);
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor && pages < 10);

    expect(pages).toBe(3); // 7 items at 3 per page: 3 + 3 + 1
    expect(seen.size).toBe(7);
  });

  it("lets a child transfer between their own accounts and directly to a sibling's account", async () => {
    const cookie = await devLogin(ctx, "ledger-parent-9");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "kid9a");
    const sibling = await createChild(ctx, cookie, "kid9b");
    const checking = child.accounts.find((a) => a.type === "checking")!;
    const savings = child.accounts.find((a) => a.type === "savings")!;
    const siblingChecking = sibling.accounts.find((a) => a.type === "checking")!;

    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 1000, category: "allowance" },
    });

    const childCookie = await childLoginCookie(ctx, "kid9a");

    const ownTransferRes = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/transfer",
      headers: { cookie: childCookie },
      payload: { fromAccountId: checking.id, toAccountId: savings.id, amountMinor: 100 },
    });
    expect(ownTransferRes.statusCode).toBe(200);

    const toSiblingRes = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/transfer",
      headers: { cookie: childCookie },
      payload: { fromAccountId: checking.id, toAccountId: siblingChecking.id, amountMinor: 50 },
    });
    expect(toSiblingRes.statusCode).toBe(200);

    const siblingAccountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${siblingChecking.id}`,
      headers: { cookie },
    });
    expect((siblingAccountRes.json() as Account).balanceMinor).toBe(50);
  });

  it("does not let a child deposit", async () => {
    const cookie = await devLogin(ctx, "ledger-parent-10");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "kid10");
    const checking = child.accounts.find((a) => a.type === "checking")!;
    const childCookie = await childLoginCookie(ctx, "kid10");

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie: childCookie },
      payload: { accountId: checking.id, amountMinor: 100, category: "other" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("10 concurrent deposits to one account end with the exact expected balance", async () => {
    const cookie = await devLogin(ctx, "ledger-parent-11");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "kid11");
    const checking = child.accounts.find((a) => a.type === "checking")!;

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        ctx.app.inject({
          method: "POST",
          url: "/api/transactions/deposit",
          headers: { cookie },
          payload: {
            accountId: checking.id,
            amountMinor: 100,
            category: "other",
            memo: `dep-${i}`,
          },
        }),
      ),
    );

    const accountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${checking.id}`,
      headers: { cookie },
    });
    expect((accountRes.json() as Account).balanceMinor).toBe(1000);
  });
});
