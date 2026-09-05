import type { Account, ChildSummary, MoneyRequest, Notification } from "@botf/shared";
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
    payload: { name: "Requests Family" },
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
    payload: { displayName: username, username, pin: "1234", withSavings: false },
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

describe("money requests", () => {
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

  it("runs the full lifecycle: submit -> notify parent -> approve -> payout -> notify child", async () => {
    const cookie = await devLogin(ctx, "req-parent-1");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "reqkid1");
    const checking = child.accounts.find((a) => a.type === "checking")!;
    const childCookie = await childLogin(ctx, "reqkid1");

    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 2000, category: "allowance" },
    });

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/requests",
      headers: { cookie: childCookie },
      payload: { accountId: checking.id, amountMinor: 800, reason: "New shoes" },
    });
    expect(createRes.statusCode).toBe(200);
    const request = createRes.json() as MoneyRequest;
    expect(request.status).toBe("pending");

    const parentNotifsRes = await ctx.app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { cookie },
    });
    const parentNotifs = (parentNotifsRes.json() as { items: Notification[] }).items;
    expect(parentNotifs.some((n) => n.type === "request_submitted")).toBe(true);

    const approveRes = await ctx.app.inject({
      method: "POST",
      url: `/api/requests/${request.id}/approve`,
      headers: { cookie },
      payload: { note: "Sure thing" },
    });
    expect(approveRes.statusCode).toBe(200);
    const approved = approveRes.json() as MoneyRequest;
    expect(approved.status).toBe("approved");
    expect(approved.transactionId).not.toBeNull();

    const accountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${checking.id}`,
      headers: { cookie },
    });
    expect((accountRes.json() as Account).balanceMinor).toBe(1200);

    const childNotifsRes = await ctx.app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { cookie: childCookie },
    });
    const childNotifs = (childNotifsRes.json() as { items: Notification[] }).items;
    expect(childNotifs.some((n) => n.type === "request_approved")).toBe(true);
  });

  it("rejects a request beyond the balance with 409 at creation time", async () => {
    const cookie = await devLogin(ctx, "req-parent-2");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "reqkid2");
    const checking = child.accounts.find((a) => a.type === "checking")!;
    const childCookie = await childLogin(ctx, "reqkid2");

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/requests",
      headers: { cookie: childCookie },
      payload: { accountId: checking.id, amountMinor: 500, reason: "Too much" },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe("INSUFFICIENT_FUNDS");
  });

  it("declines a request and notifies the requester; a decided request cannot be decided again", async () => {
    const cookie = await devLogin(ctx, "req-parent-3");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "reqkid3");
    const checking = child.accounts.find((a) => a.type === "checking")!;
    const childCookie = await childLogin(ctx, "reqkid3");

    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 1000, category: "allowance" },
    });
    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/requests",
      headers: { cookie: childCookie },
      payload: { accountId: checking.id, amountMinor: 500, reason: "Candy" },
    });
    const request = createRes.json() as MoneyRequest;

    const declineRes = await ctx.app.inject({
      method: "POST",
      url: `/api/requests/${request.id}/decline`,
      headers: { cookie },
      payload: { note: "Not this time" },
    });
    expect(declineRes.statusCode).toBe(200);
    expect((declineRes.json() as MoneyRequest).status).toBe("declined");

    const childNotifsRes = await ctx.app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { cookie: childCookie },
    });
    expect(
      (childNotifsRes.json() as { items: Notification[] }).items.some(
        (n) => n.type === "request_declined",
      ),
    ).toBe(true);

    const redecideRes = await ctx.app.inject({
      method: "POST",
      url: `/api/requests/${request.id}/approve`,
      headers: { cookie },
      payload: {},
    });
    expect(redecideRes.statusCode).toBe(409);
    expect((redecideRes.json() as { code: string }).code).toBe("REQUEST_NOT_PENDING");
  });

  it("lets a child cancel their own pending request", async () => {
    const cookie = await devLogin(ctx, "req-parent-4");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "reqkid4");
    const checking = child.accounts.find((a) => a.type === "checking")!;
    const childCookie = await childLogin(ctx, "reqkid4");
    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 1000, category: "allowance" },
    });
    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/requests",
      headers: { cookie: childCookie },
      payload: { accountId: checking.id, amountMinor: 200, reason: "Gum" },
    });
    const request = createRes.json() as MoneyRequest;

    const cancelRes = await ctx.app.inject({
      method: "POST",
      url: `/api/requests/${request.id}/cancel`,
      headers: { cookie: childCookie },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect((cancelRes.json() as MoneyRequest).status).toBe("cancelled");
  });

  it("a child cannot approve a request (403)", async () => {
    const cookie = await devLogin(ctx, "req-parent-5");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "reqkid5");
    const checking = child.accounts.find((a) => a.type === "checking")!;
    const childCookie = await childLogin(ctx, "reqkid5");
    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 1000, category: "allowance" },
    });
    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/requests",
      headers: { cookie: childCookie },
      payload: { accountId: checking.id, amountMinor: 200, reason: "Gum" },
    });
    const request = createRes.json() as MoneyRequest;

    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/requests/${request.id}/approve`,
      headers: { cookie: childCookie },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it("hides a request from a parent in a different family (404)", async () => {
    const cookieA = await devLogin(ctx, "req-parent-6a");
    await createFamily(ctx, cookieA);
    const child = await createChild(ctx, cookieA, "reqkid6");
    const checking = child.accounts.find((a) => a.type === "checking")!;
    const childCookie = await childLogin(ctx, "reqkid6");
    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie: cookieA },
      payload: { accountId: checking.id, amountMinor: 1000, category: "allowance" },
    });
    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/requests",
      headers: { cookie: childCookie },
      payload: { accountId: checking.id, amountMinor: 200, reason: "Gum" },
    });
    const request = createRes.json() as MoneyRequest;

    const cookieB = await devLogin(ctx, "req-parent-6b");
    await createFamily(ctx, cookieB);
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/requests/${request.id}/approve`,
      headers: { cookie: cookieB },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it("paginates the request list", async () => {
    const cookie = await devLogin(ctx, "req-parent-7");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "reqkid7");
    const checking = child.accounts.find((a) => a.type === "checking")!;
    const childCookie = await childLogin(ctx, "reqkid7");
    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 10000, category: "allowance" },
    });
    for (let i = 0; i < 5; i++) {
      await ctx.app.inject({
        method: "POST",
        url: "/api/requests",
        headers: { cookie: childCookie },
        payload: { accountId: checking.id, amountMinor: 10, reason: `item ${i}` },
      });
    }

    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    do {
      const url = `/api/requests?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await ctx.app.inject({ method: "GET", url, headers: { cookie } });
      const page = res.json() as { items: MoneyRequest[]; nextCursor: string | null };
      for (const item of page.items) seen.add(item.id);
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor && pages < 10);

    expect(seen.size).toBe(5);
  });
});
