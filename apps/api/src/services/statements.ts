import type { Statement as StatementDto } from "@botf/shared";
import { minorToDecimalString } from "@botf/shared";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import type { Db } from "../db";
import type { accounts, families, users } from "../db/schema";
import { transactions } from "../db/schema";
import { addMonths, getZonedParts, yearMonthKey, zonedTimeToUtc } from "../lib/timezone";
import { toTransactionDtos } from "./ledger";

/** Every "YYYY-MM" period from the account's creation month through the current month, newest first. */
export function listStatementPeriods(
  account: typeof accounts.$inferSelect,
  family: typeof families.$inferSelect,
  now: Date,
): string[] {
  const start = getZonedParts(account.createdAt, family.timezone);
  const end = getZonedParts(now, family.timezone);
  const periods: string[] = [];
  let cursor = { year: start.year, month: start.month };
  while (cursor.year < end.year || (cursor.year === end.year && cursor.month <= end.month)) {
    periods.push(yearMonthKey(cursor));
    cursor = addMonths(cursor, 1);
  }
  return periods.reverse();
}

export async function buildStatement(
  db: Db,
  account: typeof accounts.$inferSelect,
  family: typeof families.$inferSelect,
  owner: typeof users.$inferSelect,
  period: string,
): Promise<StatementDto> {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const periodStart = zonedTimeToUtc(year, month, 1, 0, 0, family.timezone);
  const next = addMonths({ year, month }, 1);
  const periodEnd = zonedTimeToUtc(next.year, next.month, 1, 0, 0, family.timezone);

  const [openingRow] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.accountId, account.id), lt(transactions.postedAt, periodStart)))
    .orderBy(desc(transactions.postedAt), desc(transactions.id))
    .limit(1);
  const openingBalanceMinor = openingRow?.runningBalanceMinor ?? 0;

  const rows = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, account.id),
        gte(transactions.postedAt, periodStart),
        lt(transactions.postedAt, periodEnd),
      ),
    )
    .orderBy(asc(transactions.postedAt), asc(transactions.id));

  let totalCreditsMinor = 0;
  let totalDebitsMinor = 0;
  let interestMinor = 0;
  for (const row of rows) {
    if (row.amountMinor > 0) totalCreditsMinor += row.amountMinor;
    else totalDebitsMinor += -row.amountMinor;
    if (row.kind === "interest") interestMinor += row.amountMinor;
  }
  const closingBalanceMinor = rows.length
    ? rows[rows.length - 1]!.runningBalanceMinor
    : openingBalanceMinor;

  const dtos = await toTransactionDtos(db, rows);

  return {
    accountId: account.id,
    accountName: account.name,
    accountNumber: account.accountNumber,
    ownerName: owner.displayName,
    familyName: family.name,
    currencyCode: family.currencyCode,
    locale: family.locale,
    period,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    openingBalanceMinor,
    closingBalanceMinor,
    totalCreditsMinor,
    totalDebitsMinor,
    interestMinor,
    transactionCount: rows.length,
    transactions: dtos,
  };
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function statementToCsv(statement: StatementDto, currencyCode: string): string {
  const lines = ["Date,Description,Category,Kind,Amount,Balance"];
  for (const t of statement.transactions) {
    const description = t.memo || t.counterpartyAccountName || "";
    lines.push(
      [
        t.postedAt,
        csvField(description),
        t.category,
        t.kind,
        minorToDecimalString(t.amountMinor, currencyCode),
        minorToDecimalString(t.runningBalanceMinor, currencyCode),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}
