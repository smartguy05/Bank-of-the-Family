import type { Account, ChildSummary, Iou, Notification, Transaction } from "@botf/shared";
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
    payload: { name: "IOU Family" },
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

async function deposit(
  ctx: TestContext,
  parentCookie: string,
  accountId: string,
  amountMinor: number,
) {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/api/transactions/deposit",
    headers: { cookie: parentCookie },
    payload: { accountId, amountMinor, category: "gift", memo: "seed" },
  });
  expect(res.statusCode).toBe(200);
}

async function notifsFor(ctx: TestContext, cookie: string): Promise<Notification[]> {
  const res = await ctx.app.inject({
    method: "GET",
    url: "/api/notifications",
    headers: { cookie },
  });
  return (res.json() as { items: Notification[] }).items;
}

describe("ious", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    // This suite logs in as a child many times across its tests; raise the per-minute child
    // login rate limit well above the default (10) so it doesn't trip on its own test traffic.
    ctx = await createTestContext({ AUTH_RATE_LIMIT_MAX: "1000" });
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(async () => {
    await resetDb(ctx.db);
  });

  it("kid-as-creditor: pending_acceptance, debtor notified, then accept opens it", async () => {
    const cookie = await devLogin(ctx, "iou-parent-1");
    await createFamily(ctx, cookie);
    const debtor = await createChild(ctx, cookie, "iou1debtor");
    const creditor = await createChild(ctx, cookie, "iou1creditor");
    const creditorCookie = await childLogin(ctx, "iou1creditor");
    const debtorCookie = await childLogin(ctx, "iou1debtor");

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: creditorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 500,
        reason: "Lunch money",
      },
    });
    expect(createRes.statusCode).toBe(200);
    const created = createRes.json() as Iou;
    expect(created.status).toBe("pending_acceptance");
    expect(created.acceptedAt).toBeNull();

    const debtorNotifs = await notifsFor(ctx, debtorCookie);
    expect(debtorNotifs.some((n) => n.type === "iou_proposed")).toBe(true);

    const acceptRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created.id}/accept`,
      headers: { cookie: debtorCookie },
    });
    expect(acceptRes.statusCode).toBe(200);
    const accepted = acceptRes.json() as Iou;
    expect(accepted.status).toBe("open");
    expect(accepted.acceptedAt).not.toBeNull();

    const creditorNotifs = await notifsFor(ctx, creditorCookie);
    expect(creditorNotifs.some((n) => n.type === "iou_accepted")).toBe(true);
  });

  it("kid-as-debtor: open immediately, creditor notified iou_created", async () => {
    const cookie = await devLogin(ctx, "iou-parent-2");
    await createFamily(ctx, cookie);
    const debtor = await createChild(ctx, cookie, "iou2debtor");
    const creditor = await createChild(ctx, cookie, "iou2creditor");
    const debtorCookie = await childLogin(ctx, "iou2debtor");
    const creditorCookie = await childLogin(ctx, "iou2creditor");

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: debtorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 300,
        reason: "Borrowed for snacks",
      },
    });
    expect(createRes.statusCode).toBe(200);
    const created = createRes.json() as Iou;
    expect(created.status).toBe("open");
    expect(created.acceptedAt).not.toBeNull();

    const creditorNotifs = await notifsFor(ctx, creditorCookie);
    expect(creditorNotifs.some((n) => n.type === "iou_created")).toBe(true);
  });

  it("parent creates: open, both kids notified iou_created, parent gets nothing", async () => {
    const cookie = await devLogin(ctx, "iou-parent-3");
    await createFamily(ctx, cookie);
    const debtor = await createChild(ctx, cookie, "iou3debtor");
    const creditor = await createChild(ctx, cookie, "iou3creditor");
    const debtorCookie = await childLogin(ctx, "iou3debtor");
    const creditorCookie = await childLogin(ctx, "iou3creditor");

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 250,
        reason: "Broke a toy",
      },
    });
    expect(createRes.statusCode).toBe(200);
    const created = createRes.json() as Iou;
    expect(created.status).toBe("open");
    expect(created.acceptedAt).toBeNull();

    const debtorNotifs = await notifsFor(ctx, debtorCookie);
    expect(debtorNotifs.some((n) => n.type === "iou_created")).toBe(true);
    const creditorNotifs = await notifsFor(ctx, creditorCookie);
    expect(creditorNotifs.some((n) => n.type === "iou_created")).toBe(true);

    const parentNotifs = await notifsFor(ctx, cookie);
    expect(parentNotifs.length).toBe(0);
  });

  it("decline sets declined; accepting later 409s IOU_NOT_PENDING", async () => {
    const cookie = await devLogin(ctx, "iou-parent-4");
    await createFamily(ctx, cookie);
    const debtor = await createChild(ctx, cookie, "iou4debtor");
    const creditor = await createChild(ctx, cookie, "iou4creditor");
    const creditorCookie = await childLogin(ctx, "iou4creditor");
    const debtorCookie = await childLogin(ctx, "iou4debtor");

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: creditorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 100,
        reason: "Bet lost",
      },
    });
    const created = createRes.json() as Iou;

    const declineRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created.id}/decline`,
      headers: { cookie: debtorCookie },
    });
    expect(declineRes.statusCode).toBe(200);
    expect((declineRes.json() as Iou).status).toBe("declined");

    const acceptRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created.id}/accept`,
      headers: { cookie: debtorCookie },
    });
    expect(acceptRes.statusCode).toBe(409);
    expect((acceptRes.json() as { code: string }).code).toBe("IOU_NOT_PENDING");
  });

  it("cancel: creator ok, non-creator sibling 403, parent cancels pending ok", async () => {
    const cookie = await devLogin(ctx, "iou-parent-5");
    await createFamily(ctx, cookie);
    const debtor = await createChild(ctx, cookie, "iou5debtor");
    const creditor = await createChild(ctx, cookie, "iou5creditor");
    await createChild(ctx, cookie, "iou5sibling");
    const creditorCookie = await childLogin(ctx, "iou5creditor");
    const siblingCookie = await childLogin(ctx, "iou5sibling");

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: creditorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 100,
        reason: "Test",
      },
    });
    const created = createRes.json() as Iou;

    const siblingCancelRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created.id}/cancel`,
      headers: { cookie: siblingCookie },
    });
    expect(siblingCancelRes.statusCode).toBe(403);

    const creatorCancelRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created.id}/cancel`,
      headers: { cookie: creditorCookie },
    });
    expect(creatorCancelRes.statusCode).toBe(200);
    expect((creatorCancelRes.json() as Iou).status).toBe("cancelled");

    const createRes2 = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: creditorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 100,
        reason: "Test 2",
      },
    });
    const created2 = createRes2.json() as Iou;
    const parentCancelRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created2.id}/cancel`,
      headers: { cookie },
    });
    expect(parentCancelRes.statusCode).toBe(200);
    expect((parentCancelRes.json() as Iou).status).toBe("cancelled");
  });

  it("full payment by debtor settles the IOU and moves balances", async () => {
    const cookie = await devLogin(ctx, "iou-parent-6");
    await createFamily(ctx, cookie);
    const debtor = await createChild(ctx, cookie, "iou6debtor");
    const creditor = await createChild(ctx, cookie, "iou6creditor");
    const debtorChecking = debtor.accounts.find((a) => a.type === "checking")!;
    const creditorChecking = creditor.accounts.find((a) => a.type === "checking")!;
    const debtorCookie = await childLogin(ctx, "iou6debtor");
    const creditorCookie = await childLogin(ctx, "iou6creditor");

    await deposit(ctx, cookie, debtorChecking.id, 1000);

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: debtorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 400,
        reason: "Movie tickets",
      },
    });
    const created = createRes.json() as Iou;

    const payRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created.id}/pay`,
      headers: { cookie: debtorCookie },
      payload: { fromAccountId: debtorChecking.id, amountMinor: 400 },
    });
    expect(payRes.statusCode).toBe(200);
    const paid = payRes.json() as Iou;
    expect(paid.status).toBe("settled");
    expect(paid.paidMinor).toBe(400);
    expect(paid.remainingMinor).toBe(0);
    expect(paid.payments.length).toBe(1);
    const payment = paid.payments[0]!;
    expect(payment.outTransactionId).not.toBeNull();
    expect(payment.inTransactionId).not.toBeNull();

    const debtorAccountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${debtorChecking.id}`,
      headers: { cookie: debtorCookie },
    });
    expect((debtorAccountRes.json() as Account).balanceMinor).toBe(600);

    const creditorAccountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${creditorChecking.id}`,
      headers: { cookie: creditorCookie },
    });
    expect((creditorAccountRes.json() as Account).balanceMinor).toBe(400);

    const outTxRes = await ctx.app.inject({
      method: "GET",
      url: `/api/transactions/${payment.outTransactionId}`,
      headers: { cookie: debtorCookie },
    });
    expect(outTxRes.statusCode).toBe(200);
    const outTx = outTxRes.json() as Transaction;
    expect(outTx.category).toBe("iou");
    expect(outTx.kind).toBe("transfer_out");
    expect(outTx.memo).toBe("IOU: Movie tickets");

    const creditorNotifs = await notifsFor(ctx, creditorCookie);
    expect(creditorNotifs.some((n) => n.type === "iou_paid")).toBe(true);
    expect(creditorNotifs.some((n) => n.type === "peer_transfer")).toBe(false);
  });

  it("two partial payments settle the IOU on the second", async () => {
    const cookie = await devLogin(ctx, "iou-parent-7");
    await createFamily(ctx, cookie);
    const debtor = await createChild(ctx, cookie, "iou7debtor");
    const creditor = await createChild(ctx, cookie, "iou7creditor");
    const debtorChecking = debtor.accounts.find((a) => a.type === "checking")!;
    const debtorCookie = await childLogin(ctx, "iou7debtor");

    await deposit(ctx, cookie, debtorChecking.id, 1000);

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: debtorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 500,
        reason: "Concert ticket",
      },
    });
    const created = createRes.json() as Iou;

    const firstPayRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created.id}/pay`,
      headers: { cookie: debtorCookie },
      payload: { fromAccountId: debtorChecking.id, amountMinor: 300 },
    });
    expect(firstPayRes.statusCode).toBe(200);
    const afterFirst = firstPayRes.json() as Iou;
    expect(afterFirst.status).toBe("open");
    expect(afterFirst.paidMinor).toBe(300);
    expect(afterFirst.remainingMinor).toBe(200);

    const secondPayRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created.id}/pay`,
      headers: { cookie: debtorCookie },
      payload: { fromAccountId: debtorChecking.id, amountMinor: 200 },
    });
    expect(secondPayRes.statusCode).toBe(200);
    const afterSecond = secondPayRes.json() as Iou;
    expect(afterSecond.status).toBe("settled");
    expect(afterSecond.paidMinor).toBe(500);
    expect(afterSecond.payments.length).toBe(2);
    expect(afterSecond.payments[0]!.amountMinor).toBe(300);
    expect(afterSecond.payments[1]!.amountMinor).toBe(200);
  });

  it("overpay is rejected and leaves the IOU unchanged", async () => {
    const cookie = await devLogin(ctx, "iou-parent-8");
    await createFamily(ctx, cookie);
    const debtor = await createChild(ctx, cookie, "iou8debtor");
    const creditor = await createChild(ctx, cookie, "iou8creditor");
    const debtorChecking = debtor.accounts.find((a) => a.type === "checking")!;
    const debtorCookie = await childLogin(ctx, "iou8debtor");

    await deposit(ctx, cookie, debtorChecking.id, 1000);

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: debtorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 200,
        reason: "Popcorn",
      },
    });
    const created = createRes.json() as Iou;

    const payRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created.id}/pay`,
      headers: { cookie: debtorCookie },
      payload: { fromAccountId: debtorChecking.id, amountMinor: 300 },
    });
    expect(payRes.statusCode).toBe(400);
    expect((payRes.json() as { code: string }).code).toBe("IOU_OVERPAY");

    const getRes = await ctx.app.inject({
      method: "GET",
      url: `/api/ious/${created.id}`,
      headers: { cookie: debtorCookie },
    });
    const unchanged = getRes.json() as Iou;
    expect(unchanged.paidMinor).toBe(0);
    expect(unchanged.status).toBe("open");
  });

  it("insufficient funds 409s and leaves the IOU and balances untouched", async () => {
    const cookie = await devLogin(ctx, "iou-parent-9");
    await createFamily(ctx, cookie);
    const debtor = await createChild(ctx, cookie, "iou9debtor");
    const creditor = await createChild(ctx, cookie, "iou9creditor");
    const debtorChecking = debtor.accounts.find((a) => a.type === "checking")!;
    const debtorCookie = await childLogin(ctx, "iou9debtor");

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: debtorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 200,
        reason: "No funds",
      },
    });
    const created = createRes.json() as Iou;

    const payRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created.id}/pay`,
      headers: { cookie: debtorCookie },
      payload: { fromAccountId: debtorChecking.id, amountMinor: 200 },
    });
    expect(payRes.statusCode).toBe(409);
    expect((payRes.json() as { code: string }).code).toBe("INSUFFICIENT_FUNDS");

    const getRes = await ctx.app.inject({
      method: "GET",
      url: `/api/ious/${created.id}`,
      headers: { cookie: debtorCookie },
    });
    const unchanged = getRes.json() as Iou;
    expect(unchanged.paidMinor).toBe(0);
    expect(unchanged.payments).toEqual([]);

    const accountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${debtorChecking.id}`,
      headers: { cookie: debtorCookie },
    });
    expect((accountRes.json() as Account).balanceMinor).toBe(0);
  });

  it("creditor cannot pay (403), paying from a sibling's account 404s, paying a pending IOU 409s", async () => {
    const cookie = await devLogin(ctx, "iou-parent-10");
    await createFamily(ctx, cookie);
    const debtor = await createChild(ctx, cookie, "iou10debtor");
    const creditor = await createChild(ctx, cookie, "iou10creditor");
    const sibling = await createChild(ctx, cookie, "iou10sibling");
    const debtorChecking = debtor.accounts.find((a) => a.type === "checking")!;
    const siblingChecking = sibling.accounts.find((a) => a.type === "checking")!;
    const debtorCookie = await childLogin(ctx, "iou10debtor");
    const creditorCookie = await childLogin(ctx, "iou10creditor");

    await deposit(ctx, cookie, debtorChecking.id, 1000);
    await deposit(ctx, cookie, siblingChecking.id, 1000);

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: debtorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 200,
        reason: "Test",
      },
    });
    const created = createRes.json() as Iou;

    const creditorPayRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created.id}/pay`,
      headers: { cookie: creditorCookie },
      payload: { fromAccountId: debtorChecking.id, amountMinor: 200 },
    });
    expect(creditorPayRes.statusCode).toBe(403);

    const siblingAccountPayRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created.id}/pay`,
      headers: { cookie: debtorCookie },
      payload: { fromAccountId: siblingChecking.id, amountMinor: 200 },
    });
    expect(siblingAccountPayRes.statusCode).toBe(404);

    // Now a pending (not yet accepted) IOU created by the creditor.
    const pendingCreateRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: creditorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 100,
        reason: "Pending test",
      },
    });
    const pending = pendingCreateRes.json() as Iou;
    expect(pending.status).toBe("pending_acceptance");

    const payPendingRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${pending.id}/pay`,
      headers: { cookie: debtorCookie },
      payload: { fromAccountId: debtorChecking.id, amountMinor: 100 },
    });
    expect(payPendingRes.statusCode).toBe(409);
    expect((payPendingRes.json() as { code: string }).code).toBe("IOU_NOT_OPEN");
  });

  it("parent pays from the debtor's account ok; from the creditor's account 400s", async () => {
    const cookie = await devLogin(ctx, "iou-parent-11");
    await createFamily(ctx, cookie);
    const debtor = await createChild(ctx, cookie, "iou11debtor");
    const creditor = await createChild(ctx, cookie, "iou11creditor");
    const debtorChecking = debtor.accounts.find((a) => a.type === "checking")!;
    const creditorChecking = creditor.accounts.find((a) => a.type === "checking")!;
    const debtorCookie = await childLogin(ctx, "iou11debtor");
    const creditorCookie = await childLogin(ctx, "iou11creditor");

    await deposit(ctx, cookie, debtorChecking.id, 1000);

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: debtorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 300,
        reason: "Parent pays",
      },
    });
    const created = createRes.json() as Iou;

    const badPayRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created.id}/pay`,
      headers: { cookie },
      payload: { fromAccountId: creditorChecking.id, amountMinor: 300 },
    });
    expect(badPayRes.statusCode).toBe(400);
    expect((badPayRes.json() as { code: string }).code).toBe("ACCOUNT_NOT_DEBTORS");

    const payRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created.id}/pay`,
      headers: { cookie },
      payload: { fromAccountId: debtorChecking.id, amountMinor: 300 },
    });
    expect(payRes.statusCode).toBe(200);
    expect((payRes.json() as Iou).status).toBe("settled");

    const debtorNotifs = await notifsFor(ctx, debtorCookie);
    expect(debtorNotifs.some((n) => n.type === "iou_paid")).toBe(true);
    const creditorNotifs = await notifsFor(ctx, creditorCookie);
    expect(creditorNotifs.some((n) => n.type === "iou_paid")).toBe(true);
  });

  it("forgive after a partial payment writes it off and keeps payments", async () => {
    const cookie = await devLogin(ctx, "iou-parent-12");
    await createFamily(ctx, cookie);
    const debtor = await createChild(ctx, cookie, "iou12debtor");
    const creditor = await createChild(ctx, cookie, "iou12creditor");
    const debtorChecking = debtor.accounts.find((a) => a.type === "checking")!;
    const debtorCookie = await childLogin(ctx, "iou12debtor");
    const creditorCookie = await childLogin(ctx, "iou12creditor");

    await deposit(ctx, cookie, debtorChecking.id, 1000);

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: debtorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 500,
        reason: "Forgive test",
      },
    });
    const created = createRes.json() as Iou;

    await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created.id}/pay`,
      headers: { cookie: debtorCookie },
      payload: { fromAccountId: debtorChecking.id, amountMinor: 100 },
    });

    const childForgiveRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created.id}/forgive`,
      headers: { cookie: debtorCookie },
    });
    expect(childForgiveRes.statusCode).toBe(403);

    const forgiveRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created.id}/forgive`,
      headers: { cookie },
    });
    expect(forgiveRes.statusCode).toBe(200);
    const forgiven = forgiveRes.json() as Iou;
    expect(forgiven.status).toBe("forgiven");
    expect(forgiven.payments.length).toBe(1);

    const debtorNotifs = await notifsFor(ctx, debtorCookie);
    expect(debtorNotifs.some((n) => n.type === "iou_forgiven")).toBe(true);
    const creditorNotifs = await notifsFor(ctx, creditorCookie);
    expect(creditorNotifs.some((n) => n.type === "iou_forgiven")).toBe(true);

    // forgiving a pending IOU 409s
    const pendingCreateRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: creditorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 100,
        reason: "Pending forgive",
      },
    });
    const pending = pendingCreateRes.json() as Iou;
    const forgivePendingRes = await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${pending.id}/forgive`,
      headers: { cookie },
    });
    expect(forgivePendingRes.statusCode).toBe(409);
    expect((forgivePendingRes.json() as { code: string }).code).toBe("IOU_NOT_OPEN");
  });

  it("visibility: a non-party sibling and a parent can list and see the IOU; status filter and pagination work", async () => {
    const cookie = await devLogin(ctx, "iou-parent-13");
    await createFamily(ctx, cookie);
    const debtor = await createChild(ctx, cookie, "iou13debtor");
    const creditor = await createChild(ctx, cookie, "iou13creditor");
    await createChild(ctx, cookie, "iou13sibling");
    const debtorCookie = await childLogin(ctx, "iou13debtor");
    const siblingCookie = await childLogin(ctx, "iou13sibling");

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: debtorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 150,
        reason: "Visible to all",
      },
    });
    const created = createRes.json() as Iou;

    const siblingListRes = await ctx.app.inject({
      method: "GET",
      url: "/api/ious",
      headers: { cookie: siblingCookie },
    });
    expect(siblingListRes.statusCode).toBe(200);
    const siblingItems = (siblingListRes.json() as { items: Iou[] }).items;
    const found = siblingItems.find((i) => i.id === created.id)!;
    expect(found).toBeDefined();
    expect(found.debtorName).toBe("iou13debtor");
    expect(found.creditorName).toBe("iou13creditor");

    const parentListRes = await ctx.app.inject({
      method: "GET",
      url: "/api/ious",
      headers: { cookie },
    });
    expect(parentListRes.statusCode).toBe(200);
    expect((parentListRes.json() as { items: Iou[] }).items.some((i) => i.id === created.id)).toBe(
      true,
    );

    const openFilterRes = await ctx.app.inject({
      method: "GET",
      url: "/api/ious?status=open",
      headers: { cookie },
    });
    const openItems = (openFilterRes.json() as { items: Iou[] }).items;
    expect(openItems.every((i) => i.status === "open")).toBe(true);
    expect(openItems.some((i) => i.id === created.id)).toBe(true);

    // Create a second IOU so pagination with limit=1 yields a next page.
    await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: debtorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 50,
        reason: "Second IOU",
      },
    });

    const page1Res = await ctx.app.inject({
      method: "GET",
      url: "/api/ious?limit=1",
      headers: { cookie },
    });
    const page1 = page1Res.json() as { items: Iou[]; nextCursor: string | null };
    expect(page1.items.length).toBe(1);
    expect(page1.nextCursor).not.toBeNull();

    const page2Res = await ctx.app.inject({
      method: "GET",
      url: `/api/ious?limit=1&cursor=${encodeURIComponent(page1.nextCursor!)}`,
      headers: { cookie },
    });
    const page2 = page2Res.json() as { items: Iou[]; nextCursor: string | null };
    expect(page2.items.length).toBe(1);
    expect(page2.items[0]!.id).not.toBe(page1.items[0]!.id);
  });

  it("validation: same user, child naming other siblings, a parent's own id as a party, and dueDate", async () => {
    const cookie = await devLogin(ctx, "iou-parent-14");
    await createFamily(ctx, cookie);
    const debtor = await createChild(ctx, cookie, "iou14debtor");
    const creditor = await createChild(ctx, cookie, "iou14creditor");
    await createChild(ctx, cookie, "iou14sibling1");
    const debtorCookie = await childLogin(ctx, "iou14debtor");
    const sibling1Cookie = await childLogin(ctx, "iou14sibling1");

    const sameUserRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: debtorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: debtor.user.id,
        amountMinor: 100,
        reason: "Same user",
      },
    });
    expect(sameUserRes.statusCode).toBe(400);
    expect((sameUserRes.json() as { code: string }).code).toBe("SAME_USER");

    const notPartyRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: sibling1Cookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 100,
        reason: "Not my business",
      },
    });
    expect(notPartyRes.statusCode).toBe(403);

    // A parent's own user id used as a party is not a valid child family member.
    const meRes = await ctx.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });
    const meId = (meRes.json() as { user: { id: string } }).user.id;
    const parentAsPartyRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie },
      payload: {
        debtorUserId: meId,
        creditorUserId: creditor.user.id,
        amountMinor: 100,
        reason: "Parent as party",
      },
    });
    expect(parentAsPartyRes.statusCode).toBe(404);

    const badDueDateRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: debtorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 100,
        reason: "Bad due date",
        dueDate: "tomorrow",
      },
    });
    expect(badDueDateRes.statusCode).toBe(400);

    const validDueDateRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: debtorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 100,
        reason: "Good due date",
        dueDate: "2026-12-25",
      },
    });
    expect(validDueDateRes.statusCode).toBe(200);
    expect((validDueDateRes.json() as Iou).dueDate).toBe("2026-12-25");
  });

  it("delete: parent deletes a pending IOU; deleting after a payment 409s; child delete 403s", async () => {
    const cookie = await devLogin(ctx, "iou-parent-15");
    await createFamily(ctx, cookie);
    const debtor = await createChild(ctx, cookie, "iou15debtor");
    const creditor = await createChild(ctx, cookie, "iou15creditor");
    const debtorChecking = debtor.accounts.find((a) => a.type === "checking")!;
    const debtorCookie = await childLogin(ctx, "iou15debtor");

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: debtorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 100,
        reason: "To delete",
      },
    });
    const created = createRes.json() as Iou;

    const childDeleteRes = await ctx.app.inject({
      method: "DELETE",
      url: `/api/ious/${created.id}`,
      headers: { cookie: debtorCookie },
    });
    expect(childDeleteRes.statusCode).toBe(403);

    const deleteRes = await ctx.app.inject({
      method: "DELETE",
      url: `/api/ious/${created.id}`,
      headers: { cookie },
    });
    expect(deleteRes.statusCode).toBe(200);
    expect((deleteRes.json() as { ok: boolean }).ok).toBe(true);

    const getRes = await ctx.app.inject({
      method: "GET",
      url: `/api/ious/${created.id}`,
      headers: { cookie },
    });
    expect(getRes.statusCode).toBe(404);

    // Now one with a payment.
    await deposit(ctx, cookie, debtorChecking.id, 1000);
    const createRes2 = await ctx.app.inject({
      method: "POST",
      url: "/api/ious",
      headers: { cookie: debtorCookie },
      payload: {
        debtorUserId: debtor.user.id,
        creditorUserId: creditor.user.id,
        amountMinor: 500,
        reason: "Has payment",
      },
    });
    const created2 = createRes2.json() as Iou;
    await ctx.app.inject({
      method: "POST",
      url: `/api/ious/${created2.id}/pay`,
      headers: { cookie: debtorCookie },
      payload: { fromAccountId: debtorChecking.id, amountMinor: 100 },
    });

    const deleteWithPaymentsRes = await ctx.app.inject({
      method: "DELETE",
      url: `/api/ious/${created2.id}`,
      headers: { cookie },
    });
    expect(deleteWithPaymentsRes.statusCode).toBe(409);
    expect((deleteWithPaymentsRes.json() as { code: string }).code).toBe("IOU_HAS_PAYMENTS");
  });
});
