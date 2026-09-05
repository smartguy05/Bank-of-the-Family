import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  accounts,
  allowanceSchedules,
  families,
  moneyRequests,
  savingsGoals,
  users,
} from "../src/db/schema";
import { runSeed } from "../src/db/seed";
import { createTestContext, resetDb, type TestContext } from "./helpers";

describe("demo seed", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDb(ctx.db);
  });
  afterAll(async () => {
    await resetDb(ctx.db);
    await ctx.close();
  });

  it("creates a realistic Demo Family and is idempotent on a second run", async () => {
    const first = await runSeed(ctx.db);
    expect(first.created).toBe(true);
    expect(first.familyId).toBeTruthy();

    const [family] = await ctx.db
      .select()
      .from(families)
      .where(eq(families.id, first.familyId!))
      .limit(1);
    expect(family?.name).toBe("Demo Family");
    expect(family?.currencyCode).toBe("USD");
    expect(family?.timezone).toBe("America/Chicago");

    const familyUsers = await ctx.db.select().from(users).where(eq(users.familyId, family!.id));
    const parents = familyUsers.filter((u) => u.role === "parent");
    const children = familyUsers.filter((u) => u.role === "child");
    expect(parents).toHaveLength(1);
    expect(children).toHaveLength(2);
    expect(children.map((c) => c.username).sort()).toEqual(["alex", "sam"]);

    const familyAccounts = await ctx.db
      .select()
      .from(accounts)
      .where(eq(accounts.familyId, family!.id));
    expect(familyAccounts).toHaveLength(4); // checking + savings x 2 kids
    for (const account of familyAccounts) {
      expect(account.balanceMinor).toBeGreaterThanOrEqual(0);
    }

    const schedules = await ctx.db
      .select()
      .from(allowanceSchedules)
      .where(eq(allowanceSchedules.familyId, family!.id));
    expect(schedules).toHaveLength(2);
    expect(schedules.every((s) => s.active)).toBe(true);

    const goals = await ctx.db
      .select()
      .from(savingsGoals)
      .where(eq(savingsGoals.familyId, family!.id));
    expect(goals).toHaveLength(2);
    expect(goals.some((g) => g.savedMinor > 0)).toBe(true);

    const requests = await ctx.db
      .select()
      .from(moneyRequests)
      .where(and(eq(moneyRequests.familyId, family!.id), eq(moneyRequests.status, "pending")));
    expect(requests).toHaveLength(1);

    // Second run is a no-op: same family id, nothing duplicated.
    const second = await runSeed(ctx.db);
    expect(second.created).toBe(false);
    expect(second.familyId).toBe(family!.id);

    const familiesAfter = await ctx.db.select().from(families);
    expect(familiesAfter.filter((f) => f.name === "Demo Family")).toHaveLength(1);
  });
});
