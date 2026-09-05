import type { Account, AllowanceSchedule, ChildSummary } from "@botf/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { postDueAllowances } from "../src/jobs/allowance";
import { advanceByOnePeriod, computeNextRun } from "../src/services/allowances";
import { cookieFrom, createTestContext, resetDb, type TestContext } from "./helpers";

async function devLogin(ctx: TestContext, sub: string) {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/api/auth/dev/login",
    payload: { authentikSub: sub, displayName: "Parent" },
  });
  return cookieFrom(res);
}

async function createFamily(ctx: TestContext, cookie: string, timezone = "America/Chicago") {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/api/families",
    headers: { cookie },
    payload: { name: "Allowance Family", timezone },
  });
  return res.json();
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

describe("computeNextRun (pure)", () => {
  it("weekly: finds the next matching weekday strictly after `after`", () => {
    // 2024-01-01 is a Monday (UTC). Ask for the next Wednesday (3) in UTC.
    const after = new Date("2024-01-01T00:00:00Z");
    const next = computeNextRun({ frequency: "weekly", dayOfWeek: 3, after, timezone: "UTC" });
    expect(next.toISOString()).toBe("2024-01-03T08:00:00.000Z");
  });

  it("weekly: when `after` is already past 08:00 on the matching day, rolls to next week", () => {
    const after = new Date("2024-01-03T09:00:00Z"); // Wednesday, past 8am UTC
    const next = computeNextRun({ frequency: "weekly", dayOfWeek: 3, after, timezone: "UTC" });
    expect(next.toISOString()).toBe("2024-01-10T08:00:00.000Z");
  });

  it("monthly: finds the next occurrence of dayOfMonth", () => {
    const after = new Date("2024-01-05T00:00:00Z");
    const next = computeNextRun({ frequency: "monthly", dayOfMonth: 15, after, timezone: "UTC" });
    expect(next.toISOString()).toBe("2024-01-15T08:00:00.000Z");
  });

  it("monthly: rolls to next month when the day has already passed", () => {
    const after = new Date("2024-01-20T00:00:00Z");
    const next = computeNextRun({ frequency: "monthly", dayOfMonth: 15, after, timezone: "UTC" });
    expect(next.toISOString()).toBe("2024-02-15T08:00:00.000Z");
  });

  it("monthly: rolls year over at December -> January", () => {
    const after = new Date("2024-12-20T00:00:00Z");
    const next = computeNextRun({ frequency: "monthly", dayOfMonth: 5, after, timezone: "UTC" });
    expect(next.toISOString()).toBe("2025-01-05T08:00:00.000Z");
  });

  it("respects a non-UTC timezone: 08:00 America/New_York in winter is 13:00 UTC", () => {
    // At this instant it's still 2023-12-31 (Sun) 19:00 in New York, so the next Monday 08:00
    // local is the very next day.
    const after = new Date("2024-01-01T00:00:00Z");
    const next = computeNextRun({
      frequency: "weekly",
      dayOfWeek: 1,
      after,
      timezone: "America/New_York",
    });
    expect(next.toISOString()).toBe("2024-01-01T13:00:00.000Z");
  });

  it("respects DST: 08:00 America/New_York in summer is 12:00 UTC", () => {
    // At this instant it's still 2024-06-30 (Sun) 20:00 in New York, so the next Monday 08:00
    // local is the very next day.
    const after = new Date("2024-07-01T00:00:00Z");
    const next = computeNextRun({
      frequency: "weekly",
      dayOfWeek: 1,
      after,
      timezone: "America/New_York",
    });
    expect(next.toISOString()).toBe("2024-07-01T12:00:00.000Z");
  });

  it("handles a DST spring-forward boundary without drifting the local time", () => {
    // US spring-forward in 2024 was March 10. Schedule a Sunday (0) allowance around it.
    const after = new Date("2024-03-08T12:00:00Z"); // Friday, before the boundary
    const next = computeNextRun({
      frequency: "weekly",
      dayOfWeek: 0,
      after,
      timezone: "America/New_York",
    });
    // Sunday March 10 08:00 EST-before-change is EDT after 2am; 08:00 local on the 10th is UTC-4.
    expect(next.toISOString()).toBe("2024-03-10T12:00:00.000Z");
  });
});

describe("advanceByOnePeriod (pure)", () => {
  it("weekly adds 7 days, preserving 08:00 local time across a DST change", () => {
    // Scheduled the Sunday just before spring-forward; advancing one week crosses the boundary.
    const scheduledAt = new Date("2024-03-03T13:00:00Z"); // 08:00 EST
    const next = advanceByOnePeriod(scheduledAt, {
      frequency: "weekly",
      timezone: "America/New_York",
    });
    expect(next.toISOString()).toBe("2024-03-10T12:00:00.000Z"); // 08:00 EDT
  });

  it("biweekly adds 14 days", () => {
    const scheduledAt = new Date("2024-01-01T08:00:00Z");
    const next = advanceByOnePeriod(scheduledAt, { frequency: "biweekly", timezone: "UTC" });
    expect(next.toISOString()).toBe("2024-01-15T08:00:00.000Z");
  });

  it("monthly advances to the same day next month, rolling the year at December", () => {
    const scheduledAt = new Date("2024-12-05T08:00:00Z");
    const next = advanceByOnePeriod(scheduledAt, {
      frequency: "monthly",
      dayOfMonth: 5,
      timezone: "UTC",
    });
    expect(next.toISOString()).toBe("2025-01-05T08:00:00.000Z");
  });
});

describe("allowances API + job", () => {
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

  it("creates a schedule with a computed nextRunAt and lists it for the account", async () => {
    const cookie = await devLogin(ctx, "allow-parent-1");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "kidA");
    const checking = child.accounts.find((a) => a.type === "checking")!;

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/allowances",
      headers: { cookie },
      payload: {
        accountId: checking.id,
        amountMinor: 500,
        frequency: "weekly",
        dayOfWeek: 1,
        memo: "Allowance",
      },
    });
    expect(res.statusCode).toBe(200);
    const schedule = res.json() as AllowanceSchedule;
    expect(schedule.active).toBe(true);
    expect(new Date(schedule.nextRunAt).getTime()).toBeGreaterThan(Date.now());

    const listRes = await ctx.app.inject({
      method: "GET",
      url: `/api/allowances?accountId=${checking.id}`,
      headers: { cookie },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json() as AllowanceSchedule[]).toHaveLength(1);
  });

  it("a child can read but not create allowances", async () => {
    const cookie = await devLogin(ctx, "allow-parent-2");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "kidB");
    const checking = child.accounts.find((a) => a.type === "checking")!;
    await ctx.app.inject({
      method: "POST",
      url: "/api/allowances",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 500, frequency: "weekly", dayOfWeek: 2 },
    });

    const childLogin = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/child/login",
      payload: { username: "kidB", pin: "1234" },
    });
    const childCookie = cookieFrom(childLogin);

    const listRes = await ctx.app.inject({
      method: "GET",
      url: "/api/allowances",
      headers: { cookie: childCookie },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json() as AllowanceSchedule[]).toHaveLength(1);

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/allowances",
      headers: { cookie: childCookie },
      payload: { accountId: checking.id, amountMinor: 100, frequency: "weekly", dayOfWeek: 2 },
    });
    expect(createRes.statusCode).toBe(403);
  });

  it("PATCH recomputes nextRunAt when the day changes, and DELETE removes the schedule", async () => {
    const cookie = await devLogin(ctx, "allow-parent-3");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "kidC");
    const checking = child.accounts.find((a) => a.type === "checking")!;

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/allowances",
      headers: { cookie },
      payload: { accountId: checking.id, amountMinor: 500, frequency: "weekly", dayOfWeek: 1 },
    });
    const schedule = createRes.json() as AllowanceSchedule;

    const patchRes = await ctx.app.inject({
      method: "PATCH",
      url: `/api/allowances/${schedule.id}`,
      headers: { cookie },
      payload: { dayOfWeek: 5 },
    });
    expect(patchRes.statusCode).toBe(200);
    const updated = patchRes.json() as AllowanceSchedule;
    expect(updated.dayOfWeek).toBe(5);
    expect(updated.nextRunAt).not.toBe(schedule.nextRunAt);

    const deleteRes = await ctx.app.inject({
      method: "DELETE",
      url: `/api/allowances/${schedule.id}`,
      headers: { cookie },
    });
    expect(deleteRes.statusCode).toBe(200);

    const listRes = await ctx.app.inject({
      method: "GET",
      url: "/api/allowances",
      headers: { cookie },
    });
    expect(listRes.json() as AllowanceSchedule[]).toHaveLength(0);
  });

  it("job posts a due allowance exactly once and advances nextRunAt into the future", async () => {
    const cookie = await devLogin(ctx, "allow-parent-4");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "kidD");
    const checking = child.accounts.find((a) => a.type === "checking")!;

    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/allowances",
      headers: { cookie },
      payload: {
        accountId: checking.id,
        amountMinor: 700,
        frequency: "weekly",
        dayOfWeek: 1,
        startAt: new Date(Date.now() - 1000).toISOString(), // already due
      },
    });
    const schedule = createRes.json() as AllowanceSchedule;

    const now = new Date();
    await postDueAllowances(ctx.db, now);

    const accountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${checking.id}`,
      headers: { cookie },
    });
    expect((accountRes.json() as Account).balanceMinor).toBe(700);

    const listRes = await ctx.app.inject({
      method: "GET",
      url: `/api/allowances?accountId=${checking.id}`,
      headers: { cookie },
    });
    const [after] = listRes.json() as AllowanceSchedule[];
    expect(new Date(after!.nextRunAt).getTime()).toBeGreaterThan(now.getTime());
    expect(after!.lastRunAt).not.toBeNull();

    // Running the job again immediately does not post a second time (idempotency key + not due).
    await postDueAllowances(ctx.db, now);
    const accountRes2 = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${checking.id}`,
      headers: { cookie },
    });
    expect((accountRes2.json() as Account).balanceMinor).toBe(700);
    void schedule;
  });

  it("a long outage posts exactly one entry and catches nextRunAt up to the future", async () => {
    const cookie = await devLogin(ctx, "allow-parent-5");
    await createFamily(ctx, cookie);
    const child = await createChild(ctx, cookie, "kidE");
    const checking = child.accounts.find((a) => a.type === "checking")!;

    await ctx.app.inject({
      method: "POST",
      url: "/api/allowances",
      headers: { cookie },
      payload: {
        accountId: checking.id,
        amountMinor: 400,
        frequency: "weekly",
        dayOfWeek: 1,
        // Due 6 weeks ago: simulates the scheduler having been down for a while.
        startAt: new Date(Date.now() - 6 * 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    const now = new Date();
    await postDueAllowances(ctx.db, now);

    const accountRes = await ctx.app.inject({
      method: "GET",
      url: `/api/accounts/${checking.id}`,
      headers: { cookie },
    });
    // Exactly one allowance posted, not six.
    expect((accountRes.json() as Account).balanceMinor).toBe(400);
  });
});
