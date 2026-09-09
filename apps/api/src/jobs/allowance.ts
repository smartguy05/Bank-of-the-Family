import { formatMoney } from "@botf/shared";
import { and, eq, lte } from "drizzle-orm";
import type { Db } from "../db";
import { accounts, allowanceSchedules, families } from "../db/schema";
import { advanceByOnePeriod } from "../services/allowances";
import { postEntry } from "../services/ledger";
import { notify } from "../services/notify";

/**
 * Posts every allowance schedule whose `nextRunAt` is due, one entry per schedule per run.
 *
 * The entry is keyed on the *scheduled* instant (not "now"), so a retry of the same job tick is a
 * no-op. Afterwards `nextRunAt` is advanced whole periods at a time — from the scheduled time, not
 * from `now` — until it's back in the future. That means a long scheduler outage never pays out a
 * backlog of missed allowances: it posts exactly one entry to catch the schedule up, and any fully
 * skipped periods are only logged.
 */
export async function postDueAllowances(db: Db, now: Date): Promise<void> {
  const due = await db
    .select()
    .from(allowanceSchedules)
    .where(and(eq(allowanceSchedules.active, true), lte(allowanceSchedules.nextRunAt, now)));

  for (const schedule of due) {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, schedule.accountId))
      .limit(1);
    if (!account || account.status !== "open") {
      await db
        .update(allowanceSchedules)
        .set({ active: false })
        .where(eq(allowanceSchedules.id, schedule.id));
      continue;
    }

    const [family] = await db
      .select()
      .from(families)
      .where(eq(families.id, schedule.familyId))
      .limit(1);
    if (!family) continue;

    const scheduledAt = schedule.nextRunAt;

    // Expired schedules (e.g. a seasonal job that has ended) stop paying: retire the schedule
    // without posting once its due run falls after the expiration instant.
    if (schedule.endsAt && scheduledAt.getTime() > schedule.endsAt.getTime()) {
      await db
        .update(allowanceSchedules)
        .set({ active: false })
        .where(eq(allowanceSchedules.id, schedule.id));
      continue;
    }

    const row = await postEntry(db, {
      familyId: schedule.familyId,
      accountId: schedule.accountId,
      kind: "allowance",
      category: "allowance",
      amountMinor: schedule.amountMinor,
      memo: schedule.memo,
      createdByUserId: schedule.createdBy,
      idempotencyKey: `allowance:${schedule.id}:${scheduledAt.toISOString()}`,
      postedAt: now,
    });

    const advanceOpts = {
      frequency: schedule.frequency,
      dayOfMonth: schedule.dayOfMonth,
      timezone: family.timezone,
    };
    let next = advanceByOnePeriod(scheduledAt, advanceOpts);
    let skipped = 0;
    while (next.getTime() <= now.getTime()) {
      skipped++;
      next = advanceByOnePeriod(next, advanceOpts);
    }
    if (skipped > 0) {
      console.warn(
        `allowance schedule ${schedule.id}: skipped ${skipped} missed run(s) during an outage, ` +
          `resuming at ${next.toISOString()}`,
      );
    }

    // If the next run would land past the expiration, this was the final payout — retire it.
    const expired = schedule.endsAt !== null && next.getTime() > schedule.endsAt.getTime();
    await db
      .update(allowanceSchedules)
      .set({ nextRunAt: next, lastRunAt: now, ...(expired ? { active: false } : {}) })
      .where(eq(allowanceSchedules.id, schedule.id));

    const amountText = formatMoney(schedule.amountMinor, family.currencyCode, family.locale, {
      signDisplay: "always",
    });
    await notify(db, {
      userId: account.ownerUserId,
      type: "allowance",
      title: "Allowance deposited",
      body: schedule.memo ? `${amountText} — ${schedule.memo}` : amountText,
      data: { accountId: account.id, transactionId: row.id },
    });
  }
}
