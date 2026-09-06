import type { Account, ChildSummary, Notification, TransferResult } from "@botf/shared";
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
    payload: { name: "Peer Transfer Family" },
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

describe("peer-to-peer send", () => {
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

  it("sends money from one child to a sibling's default account and notifies only the recipient", async () => {
    const cookie = await devLogin(ctx, "peer-send-parent-1");
    await createFamily(ctx, cookie);
    const sender = await createChild(ctx, cookie, "sender1");
    const recipient = await createChild(ctx, cookie, "recipient1");
    const senderChecking = sender.accounts.find((a) => a.type === "checking")!;
    const recipientChecking = recipient.accounts.find((a) => a.type === "checking")!;

    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: senderChecking.id, amountMinor: 1000, category: "allowance" },
    });

    const senderCookie = await childLogin(ctx, "sender1");
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/send",
      headers: { cookie: senderCookie },
      payload: {
        fromAccountId: senderChecking.id,
        toUserId: recipient.user.id,
        amountMinor: 250,
        memo: "For the movies",
      },
    });
    expect(res.statusCode).toBe(200);
    const result = res.json() as TransferResult;
    expect(result.out.amountMinor).toBe(-250);
    expect(result.in.amountMinor).toBe(250);

    const senderAccountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${senderChecking.id}`,
      headers: { cookie: senderCookie },
    });
    expect((senderAccountRes.json() as Account).balanceMinor).toBe(750);

    const recipientCookie = await childLogin(ctx, "recipient1");
    const recipientAccountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${recipientChecking.id}`,
      headers: { cookie: recipientCookie },
    });
    expect((recipientAccountRes.json() as Account).balanceMinor).toBe(250);

    const recipientNotifsRes = await ctx.app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { cookie: recipientCookie },
    });
    const recipientNotifs = (recipientNotifsRes.json() as { items: Notification[] }).items;
    expect(recipientNotifs.some((n) => n.type === "peer_transfer")).toBe(true);

    const senderNotifsRes = await ctx.app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { cookie: senderCookie },
    });
    const senderNotifs = (senderNotifsRes.json() as { items: Notification[] }).items;
    expect(senderNotifs.some((n) => n.type === "peer_transfer")).toBe(false);
  });

  it("rejects sending money to yourself", async () => {
    const cookie = await devLogin(ctx, "peer-send-parent-2");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "selfsend");
    const checking = child.accounts.find((a) => a.type === "checking")!;
    const childCookie = await childLogin(ctx, "selfsend");

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/send",
      headers: { cookie: childCookie },
      payload: { fromAccountId: checking.id, toUserId: child.user.id, amountMinor: 100 },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code: string }).code).toBe("SAME_USER");
  });

  it("rejects a recipient in a different family (404)", async () => {
    const cookieA = await devLogin(ctx, "peer-send-parent-3a");
    await createFamily(ctx, cookieA);
    const sender = await createChild(ctx, cookieA, "sender3");
    const senderChecking = sender.accounts.find((a) => a.type === "checking")!;
    const senderCookie = await childLogin(ctx, "sender3");

    const cookieB = await devLogin(ctx, "peer-send-parent-3b");
    await createFamily(ctx, cookieB);
    const outsider = await createChild(ctx, cookieB, "outsider3");

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/send",
      headers: { cookie: senderCookie },
      payload: { fromAccountId: senderChecking.id, toUserId: outsider.user.id, amountMinor: 100 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects sending more than the balance with no partial state", async () => {
    const cookie = await devLogin(ctx, "peer-send-parent-4");
    await createFamily(ctx, cookie);
    const sender = await createChild(ctx, cookie, "sender4");
    const recipient = await createChild(ctx, cookie, "recipient4");
    const senderChecking = sender.accounts.find((a) => a.type === "checking")!;
    const senderCookie = await childLogin(ctx, "sender4");

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/send",
      headers: { cookie: senderCookie },
      payload: {
        fromAccountId: senderChecking.id,
        toUserId: recipient.user.id,
        amountMinor: 500,
      },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe("INSUFFICIENT_FUNDS");

    const senderAccountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${senderChecking.id}`,
      headers: { cookie: senderCookie },
    });
    expect((senderAccountRes.json() as Account).balanceMinor).toBe(0);
  });
});
