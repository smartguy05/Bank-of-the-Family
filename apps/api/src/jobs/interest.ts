import { formatMoney, monthlyInterestMinor } from "@botf/shared";
import { and, eq, gt } from "drizzle-orm";
import type { Db } from "../db";
import { accounts, families } from "../db/schema";
import { addMonths, getZonedParts, monthLabel, yearMonthKey } from "../lib/timezone";
import { postEntry } from "../services/ledger";
import { notify } from "../services/notify";

/**
 * Posts monthly interest, at most once per calendar month (as seen in each family's timezone), for
 * every open account with a positive interest rate. Gated by comparing `lastInterestPostedAt`'s
 * year-month to the current one — so re-running within the same month is a no-op, and running
 * again after the month rolls over posts again. Zero-rate accounts never reach this job (filtered
 * in the query); a positive rate on a zero balance computes to zero and is skipped without posting
 * an empty entry, but still marks the month as done so it isn't recomputed on every tick.
 */
export async function postMonthlyInterest(db: Db, now: Date): Promise<void> {
  const rows = await db
    .select({ account: accounts, family: families })
    .from(accounts)
    .innerJoin(families, eq(accounts.familyId, families.id))
    .where(and(eq(accounts.status, "open"), gt(accounts.interestRateBps, 0)));

  for (const { account, family } of rows) {
    const nowParts = getZonedParts(now, family.timezone);
    const currentYm = yearMonthKey(nowParts);

    if (account.lastInterestPostedAt) {
      const lastYm = yearMonthKey(getZonedParts(account.lastInterestPostedAt, family.timezone));
      if (lastYm === currentYm) continue;
    }
    const createdYm = yearMonthKey(getZonedParts(account.createdAt, family.timezone));
    if (createdYm === currentYm) continue;

    const amountMinor = monthlyInterestMinor(account.balanceMinor, account.interestRateBps);
    if (amountMinor <= 0) {
      await db
        .update(accounts)
        .set({ lastInterestPostedAt: now })
        .where(eq(accounts.id, account.id));
      continue;
    }

    const prev = addMonths(nowParts, -1);
    const memo = `Interest for ${monthLabel(prev.year, prev.month)} ${prev.year}`;
    const row = await postEntry(db, {
      familyId: account.familyId,
      accountId: account.id,
      kind: "interest",
      category: "interest",
      amountMinor,
      memo,
      createdByUserId: null,
      idempotencyKey: `interest:${account.id}:${currentYm}`,
      postedAt: now,
    });

    await db.update(accounts).set({ lastInterestPostedAt: now }).where(eq(accounts.id, account.id));

    await notify(db, {
      userId: account.ownerUserId,
      type: "interest",
      title: "Interest earned",
      body: `${formatMoney(amountMinor, family.currencyCode, family.locale, { signDisplay: "always" })} — ${memo}`,
      data: { accountId: account.id, transactionId: row.id },
    });
  }
}
