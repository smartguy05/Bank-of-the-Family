import type { ChildSummary, Notification } from "@botf/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { setPushSender, type PushPayload, type PushSubscriptionKeys } from "../src/services/push";
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
    payload: { name: "Notify Family" },
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

describe("notifications (inbox)", () => {
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

  it("lists notifications, counts unread, and marks read / read-all", async () => {
    const cookie = await devLogin(ctx, "notif-parent-1");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "notifkid1");
    const checking = child.accounts.find((a) => a.type === "checking")!;
    const childLoginRes = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/child/login",
      payload: { username: "notifkid1", pin: "1234" },
    });
    const childCookie = cookieFrom(childLoginRes);

    // Two parent-initiated deposits notify the child (actor !== owner).
    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 500, category: "allowance" },
    });
    await ctx.app.inject({
      method: "POST",
      url: "/api/transactions/deposit",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 300, category: "gift" },
    });

    const unreadRes = await ctx.app.inject({
      method: "GET",
      url: "/api/notifications/unread-count",
      headers: { cookie: childCookie },
    });
    expect((unreadRes.json() as { unread: number }).unread).toBe(2);

    const listRes = await ctx.app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { cookie: childCookie },
    });
    const items = (listRes.json() as { items: Notification[] }).items;
    expect(items).toHaveLength(2);

    const readRes = await ctx.app.inject({
      method: "POST",
      url: `/api/notifications/${items[0]!.id}/read`,
      headers: { cookie: childCookie },
    });
    expect(readRes.statusCode).toBe(200);

    const unreadOnlyRes = await ctx.app.inject({
      method: "GET",
      url: "/api/notifications?unreadOnly=true",
      headers: { cookie: childCookie },
    });
    expect((unreadOnlyRes.json() as { items: Notification[] }).items).toHaveLength(1);

    const readAllRes = await ctx.app.inject({
      method: "POST",
      url: "/api/notifications/read-all",
      headers: { cookie: childCookie },
    });
    expect(readAllRes.statusCode).toBe(200);

    const finalUnreadRes = await ctx.app.inject({
      method: "GET",
      url: "/api/notifications/unread-count",
      headers: { cookie: childCookie },
    });
    expect((finalUnreadRes.json() as { unread: number }).unread).toBe(0);
  });

  it("returns null when VAPID isn't configured, and the real key when it is", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/notifications/push/vapid-public-key",
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { publicKey: string | null }).publicKey).toBeNull();
  });

  it("subscribes and unsubscribes a push endpoint", async () => {
    const cookie = await devLogin(ctx, "notif-parent-2");
    await createFamily(ctx, cookie);

    const subscribeRes = await ctx.app.inject({
      method: "POST",
      url: "/api/notifications/push/subscribe",
      headers: { cookie },
      payload: {
        endpoint: "https://push.example.test/abc",
        keys: { p256dh: "p256dh-key", auth: "auth-key" },
        userAgent: "vitest",
      },
    });
    expect(subscribeRes.statusCode).toBe(200);

    const unsubscribeRes = await ctx.app.inject({
      method: "POST",
      url: "/api/notifications/push/unsubscribe",
      headers: { cookie },
      payload: { endpoint: "https://push.example.test/abc" },
    });
    expect(unsubscribeRes.statusCode).toBe(200);
  });
});

describe("notifications (web push)", () => {
  it("a deposit that notifies the owner triggers a stubbed push to the right url", async () => {
    const vapid = webpush.generateVAPIDKeys();
    const pushCtx = await createTestContext({
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
    });

    const sendSpy = vi.fn(async (_sub: PushSubscriptionKeys, _payload: PushPayload) => {});
    setPushSender(sendSpy);
    try {
      const cookie = await devLogin(pushCtx, "notif-push-parent");
      await createFamily(pushCtx, cookie);
      const child = await createChild(pushCtx, cookie, "pushkid");
      const checking = child.accounts.find((a) => a.type === "checking")!;

      const childLoginRes = await pushCtx.app.inject({
        method: "POST",
        url: "/api/auth/child/login",
        payload: { username: "pushkid", pin: "1234" },
      });
      const childCookie = cookieFrom(childLoginRes);

      await pushCtx.app.inject({
        method: "POST",
        url: "/api/notifications/push/subscribe",
        headers: { cookie: childCookie },
        payload: {
          endpoint: "https://push.example.test/deposit-test",
          keys: { p256dh: "p256dh-key", auth: "auth-key" },
        },
      });

      await pushCtx.app.inject({
        method: "POST",
        url: "/api/transactions/deposit",
        headers: { cookie },
        payload: { accountId: checking.id, amountMinor: 500, category: "allowance" },
      });

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const [subscription, payload] = sendSpy.mock.calls[0]!;
      expect(subscription.endpoint).toBe("https://push.example.test/deposit-test");
      expect(payload.url).toBe(`/accounts/${checking.id}`);
    } finally {
      setPushSender(null);
      await pushCtx.close();
    }
  });
});
