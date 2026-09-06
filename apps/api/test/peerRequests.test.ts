import type { Account, ChildSummary, Notification, PeerRequest } from "@botf/shared";
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
    payload: { name: "Peer Requests Family" },
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

describe("peer requests", () => {
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

  it("runs the full lifecycle: create -> notify payer -> approve with chosen account -> both balances move", async () => {
    const cookie = await devLogin(ctx, "peer-req-parent-1");
    await createFamily(ctx, cookie);
    const requester = await createChild(ctx, cookie, "peerreq1a");
    const payer = await createChild(ctx, cookie, "peerreq1b");
    const requesterChecking = requester.accounts.find((a) => a.type === "checking")!;
    const payerChecking = payer.accounts.find((a) => a.type === "checking")!;
    const requesterCookie = await childLogin(ctx, "peerreq1a");
    const payerCookie = await childLogin(ctx, "peerreq1b");

    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: payerChecking.id, amountMinor: 1000, category: "allowance" },
    });

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/peer-requests",
      headers: { cookie: requesterCookie },
      payload: {
        payerUserId: payer.user.id,
        requesterAccountId: requesterChecking.id,
        amountMinor: 400,
        reason: "Splitting a gift",
      },
    });
    expect(createRes.statusCode).toBe(200);
    const created = createRes.json() as PeerRequest;
    expect(created.status).toBe("pending");

    const payerNotifsRes = await ctx.app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { cookie: payerCookie },
    });
    const payerNotifs = (payerNotifsRes.json() as { items: Notification[] }).items;
    expect(payerNotifs.some((n) => n.type === "peer_request_received")).toBe(true);

    const approveRes = await ctx.app.inject({
      method: "POST",
      url: `/api/peer-requests/${created.id}/approve`,
      headers: { cookie: payerCookie },
      payload: { fromAccountId: payerChecking.id, note: "Sure!" },
    });
    expect(approveRes.statusCode).toBe(200);
    const approved = approveRes.json() as PeerRequest;
    expect(approved.status).toBe("approved");
    expect(approved.payerTransactionId).not.toBeNull();
    expect(approved.requesterTransactionId).not.toBeNull();

    const payerAccountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${payerChecking.id}`,
      headers: { cookie: payerCookie },
    });
    expect((payerAccountRes.json() as Account).balanceMinor).toBe(600);

    const requesterAccountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${requesterChecking.id}`,
      headers: { cookie: requesterCookie },
    });
    expect((requesterAccountRes.json() as Account).balanceMinor).toBe(400);

    const requesterNotifsRes = await ctx.app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { cookie: requesterCookie },
    });
    const requesterNotifs = (requesterNotifsRes.json() as { items: Notification[] }).items;
    expect(requesterNotifs.some((n) => n.type === "peer_request_approved")).toBe(true);
    // Approval goes through the ledger directly, not the generic /transactions/send path, so
    // there should be no duplicate "peer_transfer" notification for the same money movement.
    expect(requesterNotifs.some((n) => n.type === "peer_transfer")).toBe(false);
  });

  it("declines a request and leaves balances untouched", async () => {
    const cookie = await devLogin(ctx, "peer-req-parent-2");
    await createFamily(ctx, cookie);
    const requester = await createChild(ctx, cookie, "peerreq2a");
    const payer = await createChild(ctx, cookie, "peerreq2b");
    const requesterChecking = requester.accounts.find((a) => a.type === "checking")!;
    const payerChecking = payer.accounts.find((a) => a.type === "checking")!;
    const requesterCookie = await childLogin(ctx, "peerreq2a");
    const payerCookie = await childLogin(ctx, "peerreq2b");

    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: payerChecking.id, amountMinor: 500, category: "allowance" },
    });

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/peer-requests",
      headers: { cookie: requesterCookie },
      payload: {
        payerUserId: payer.user.id,
        requesterAccountId: requesterChecking.id,
        amountMinor: 200,
        reason: "Candy money",
      },
    });
    const created = createRes.json() as PeerRequest;

    const declineRes = await ctx.app.inject({
      method: "POST",
      url: `/api/peer-requests/${created.id}/decline`,
      headers: { cookie: payerCookie },
      payload: { note: "Not this time" },
    });
    expect(declineRes.statusCode).toBe(200);
    expect((declineRes.json() as PeerRequest).status).toBe("declined");

    const payerAccountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${payerChecking.id}`,
      headers: { cookie: payerCookie },
    });
    expect((payerAccountRes.json() as Account).balanceMinor).toBe(500);

    const requesterNotifsRes = await ctx.app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { cookie: requesterCookie },
    });
    expect(
      (requesterNotifsRes.json() as { items: Notification[] }).items.some(
        (n) => n.type === "peer_request_declined",
      ),
    ).toBe(true);
  });

  it("lets the requester cancel their own pending request", async () => {
    const cookie = await devLogin(ctx, "peer-req-parent-3");
    await createFamily(ctx, cookie);
    const requester = await createChild(ctx, cookie, "peerreq3a");
    const payer = await createChild(ctx, cookie, "peerreq3b");
    const requesterChecking = requester.accounts.find((a) => a.type === "checking")!;
    const requesterCookie = await childLogin(ctx, "peerreq3a");

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/peer-requests",
      headers: { cookie: requesterCookie },
      payload: {
        payerUserId: payer.user.id,
        requesterAccountId: requesterChecking.id,
        amountMinor: 100,
        reason: "Gum",
      },
    });
    const created = createRes.json() as PeerRequest;

    const cancelRes = await ctx.app.inject({
      method: "POST",
      url: `/api/peer-requests/${created.id}/cancel`,
      headers: { cookie: requesterCookie },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect((cancelRes.json() as PeerRequest).status).toBe("cancelled");
  });

  it("hides a request from a non-payer child (404 on approve/decline)", async () => {
    const cookie = await devLogin(ctx, "peer-req-parent-4");
    await createFamily(ctx, cookie);
    const requester = await createChild(ctx, cookie, "peerreq4a");
    const payer = await createChild(ctx, cookie, "peerreq4b");
    await createChild(ctx, cookie, "peerreq4c");
    const requesterChecking = requester.accounts.find((a) => a.type === "checking")!;
    const requesterCookie = await childLogin(ctx, "peerreq4a");
    const bystanderCookie = await childLogin(ctx, "peerreq4c");

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/peer-requests",
      headers: { cookie: requesterCookie },
      payload: {
        payerUserId: payer.user.id,
        requesterAccountId: requesterChecking.id,
        amountMinor: 100,
        reason: "Gum",
      },
    });
    const created = createRes.json() as PeerRequest;

    const approveRes = await ctx.app.inject({
      method: "POST",
      url: `/api/peer-requests/${created.id}/approve`,
      headers: { cookie: bystanderCookie },
      payload: { fromAccountId: requesterChecking.id },
    });
    expect(approveRes.statusCode).toBe(404);

    const declineRes = await ctx.app.inject({
      method: "POST",
      url: `/api/peer-requests/${created.id}/decline`,
      headers: { cookie: bystanderCookie },
      payload: {},
    });
    expect(declineRes.statusCode).toBe(404);
  });

  it("leaves the request pending with no payer account set when the payer can't afford it", async () => {
    const cookie = await devLogin(ctx, "peer-req-parent-5");
    await createFamily(ctx, cookie);
    const requester = await createChild(ctx, cookie, "peerreq5a");
    const payer = await createChild(ctx, cookie, "peerreq5b");
    const requesterChecking = requester.accounts.find((a) => a.type === "checking")!;
    const payerChecking = payer.accounts.find((a) => a.type === "checking")!;
    const requesterCookie = await childLogin(ctx, "peerreq5a");
    const payerCookie = await childLogin(ctx, "peerreq5b");

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/peer-requests",
      headers: { cookie: requesterCookie },
      payload: {
        payerUserId: payer.user.id,
        requesterAccountId: requesterChecking.id,
        amountMinor: 500,
        reason: "Too much",
      },
    });
    const created = createRes.json() as PeerRequest;

    const approveRes = await ctx.app.inject({
      method: "POST",
      url: `/api/peer-requests/${created.id}/approve`,
      headers: { cookie: payerCookie },
      payload: { fromAccountId: payerChecking.id },
    });
    expect(approveRes.statusCode).toBe(409);
    expect((approveRes.json() as { code: string }).code).toBe("INSUFFICIENT_FUNDS");

    const listRes = await ctx.app.inject({
      method: "GET",
      url: "/api/peer-requests",
      headers: { cookie: payerCookie },
    });
    const stillPending = (listRes.json() as { items: PeerRequest[] }).items.find(
      (r) => r.id === created.id,
    )!;
    expect(stillPending.status).toBe("pending");
    expect(stillPending.payerAccountId).toBeNull();
  });
});
