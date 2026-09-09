import type {
  AllowanceFrequency,
  AllowanceSchedule as AllowanceScheduleDto,
  CreateAllowanceBody,
  UpdateAllowanceBody,
} from "@botf/shared";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db";
import { accounts, allowanceSchedules } from "../db/schema";
import { conflict, notFound } from "../lib/errors";
import { addDaysZoned, addMonths, getZonedParts, zonedTimeToUtc } from "../lib/timezone";
import { getAccountOr404 } from "./accounts";

const RUN_HOUR = 8;
const RUN_MINUTE = 0;

export function toAllowanceDto(row: typeof allowanceSchedules.$inferSelect): AllowanceScheduleDto {
  return {
    id: row.id,
    familyId: row.familyId,
    accountId: row.accountId,
    amountMinor: row.amountMinor,
    frequency: row.frequency,
    dayOfWeek: row.dayOfWeek,
    dayOfMonth: row.dayOfMonth,
    memo: row.memo,
    nextRunAt: row.nextRunAt.toISOString(),
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    active: row.active,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface ComputeNextRunInput {
  frequency: AllowanceFrequency;
  /** 0 = Sunday … 6 = Saturday. Required for weekly/biweekly. */
  dayOfWeek?: number | null;
  /** 1-28. Required for monthly. */
  dayOfMonth?: number | null;
  /** The instant to compute the next run strictly after. */
  after: Date;
  timezone: string;
}

/**
 * Pure: the next 08:00-local instant, strictly after `after`, that matches the schedule's
 * day-of-week (weekly/biweekly) or day-of-month (monthly) in `timezone`.
 *
 * For biweekly this only anchors which *day* the allowance falls on — it doesn't know about any
 * prior run, so the first computed date is the same as for weekly. The two-week cadence itself is
 * enforced afterwards, run to run, by `advanceByOnePeriod`.
 */
export function computeNextRun(input: ComputeNextRunInput): Date {
  const { after, timezone, frequency } = input;

  if (frequency === "monthly") {
    const dayOfMonth = input.dayOfMonth ?? 1;
    const parts = getZonedParts(after, timezone);
    let { year, month } = parts;
    let candidate = zonedTimeToUtc(year, month, dayOfMonth, RUN_HOUR, RUN_MINUTE, timezone);
    if (candidate.getTime() <= after.getTime()) {
      ({ year, month } = addMonths({ year, month }, 1));
      candidate = zonedTimeToUtc(year, month, dayOfMonth, RUN_HOUR, RUN_MINUTE, timezone);
    }
    return candidate;
  }

  const dayOfWeek = input.dayOfWeek ?? 0;
  const parts = getZonedParts(after, timezone);
  let delta = (dayOfWeek - parts.weekday + 7) % 7;
  let candidate = addDaysZoned(parts, delta, RUN_HOUR, RUN_MINUTE, timezone);
  if (candidate.getTime() <= after.getTime()) {
    delta += 7;
    candidate = addDaysZoned(parts, delta, RUN_HOUR, RUN_MINUTE, timezone);
  }
  return candidate;
}

/**
 * Pure: advances an already-scheduled run instant by exactly one period (7/14 days, or 1 calendar
 * month), re-anchored to 08:00 local time. Used by the job to move `nextRunAt` forward after
 * posting, and to skip past any periods a scheduler outage caused to be missed entirely.
 */
export function advanceByOnePeriod(
  scheduledAt: Date,
  input: { frequency: AllowanceFrequency; dayOfMonth?: number | null; timezone: string },
): Date {
  const parts = getZonedParts(scheduledAt, input.timezone);
  if (input.frequency === "monthly") {
    const { year, month } = addMonths(parts, 1);
    const day = input.dayOfMonth ?? parts.day;
    return zonedTimeToUtc(year, month, day, RUN_HOUR, RUN_MINUTE, input.timezone);
  }
  const days = input.frequency === "biweekly" ? 14 : 7;
  return addDaysZoned(parts, days, RUN_HOUR, RUN_MINUTE, input.timezone);
}

export async function listAllowances(
  db: Db,
  params: { familyId: string; accountId?: string; ownerUserId?: string },
): Promise<AllowanceScheduleDto[]> {
  const conds = [eq(allowanceSchedules.familyId, params.familyId)];
  if (params.accountId) conds.push(eq(allowanceSchedules.accountId, params.accountId));
  const rows = await db
    .select()
    .from(allowanceSchedules)
    .where(and(...conds))
    .orderBy(desc(allowanceSchedules.createdAt));

  if (!params.ownerUserId) return rows.map(toAllowanceDto);

  const ownerAccounts = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.ownerUserId, params.ownerUserId));
  const ownerAccountIds = new Set(ownerAccounts.map((a) => a.id));
  return rows.filter((r) => ownerAccountIds.has(r.accountId)).map(toAllowanceDto);
}

export async function getAllowanceOr404(
  db: Db,
  familyId: string,
  id: string,
): Promise<typeof allowanceSchedules.$inferSelect> {
  const [row] = await db
    .select()
    .from(allowanceSchedules)
    .where(and(eq(allowanceSchedules.id, id), eq(allowanceSchedules.familyId, familyId)))
    .limit(1);
  if (!row) throw notFound("Allowance schedule");
  return row;
}

export async function createAllowance(
  db: Db,
  familyId: string,
  createdBy: string,
  timezone: string,
  body: CreateAllowanceBody,
): Promise<AllowanceScheduleDto> {
  const account = await getAccountOr404(db, body.accountId, familyId);
  if (account.status !== "open") throw conflict("ACCOUNT_CLOSED", "This account is closed");

  const nextRunAt = body.startAt
    ? new Date(body.startAt)
    : computeNextRun({
        frequency: body.frequency,
        dayOfWeek: body.dayOfWeek,
        dayOfMonth: body.dayOfMonth,
        after: new Date(),
        timezone,
      });

  const [row] = await db
    .insert(allowanceSchedules)
    .values({
      familyId,
      accountId: body.accountId,
      amountMinor: body.amountMinor,
      frequency: body.frequency,
      dayOfWeek: body.dayOfWeek ?? null,
      dayOfMonth: body.dayOfMonth ?? null,
      memo: body.memo,
      nextRunAt,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      createdBy,
    })
    .returning();
  return toAllowanceDto(row!);
}

export async function updateAllowance(
  db: Db,
  familyId: string,
  timezone: string,
  id: string,
  body: UpdateAllowanceBody,
): Promise<AllowanceScheduleDto> {
  const current = await getAllowanceOr404(db, familyId, id);
  const scheduleChanged =
    body.frequency !== undefined || body.dayOfWeek !== undefined || body.dayOfMonth !== undefined;

  const nextRunAt = scheduleChanged
    ? computeNextRun({
        frequency: body.frequency ?? current.frequency,
        dayOfWeek: body.dayOfWeek !== undefined ? body.dayOfWeek : current.dayOfWeek,
        dayOfMonth: body.dayOfMonth !== undefined ? body.dayOfMonth : current.dayOfMonth,
        after: new Date(),
        timezone,
      })
    : current.nextRunAt;

  // `endsAt` arrives as an ISO string (or null to clear); the column wants a Date. Leaving it out
  // of the update entirely when undefined keeps the existing expiration untouched.
  const { endsAt, ...rest } = body;
  const [row] = await db
    .update(allowanceSchedules)
    .set({
      ...rest,
      nextRunAt,
      ...(endsAt !== undefined ? { endsAt: endsAt ? new Date(endsAt) : null } : {}),
    })
    .where(eq(allowanceSchedules.id, id))
    .returning();
  return toAllowanceDto(row!);
}

export async function deleteAllowance(db: Db, familyId: string, id: string): Promise<void> {
  const result = await db
    .delete(allowanceSchedules)
    .where(and(eq(allowanceSchedules.id, id), eq(allowanceSchedules.familyId, familyId)))
    .returning({ id: allowanceSchedules.id });
  if (result.length === 0) throw notFound("Allowance schedule");
}
