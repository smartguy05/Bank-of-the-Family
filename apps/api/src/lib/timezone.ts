/**
 * Timezone-aware date math used by allowances, interest and statements — all "on the 1st of the
 * month" / "every Tuesday at 8am" scheduling is defined in the *family's* timezone, not the
 * server's or UTC. No date library is used; these are built directly on `Intl.DateTimeFormat`.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Reads the wall-clock date/time parts of `date` as seen in `timeZone`. */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) map[part.type] = part.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === "24" ? "0" : map.hour),
    minute: Number(map.minute),
    weekday: WEEKDAY_INDEX[map.weekday ?? "Sun"] ?? 0,
  };
}

/** Offset (local minus UTC, in minutes) in effect for `timeZone` at `date`. */
function offsetMinutesAt(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) map[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour === "24" ? "0" : map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return (asUtc - date.getTime()) / 60000;
}

/**
 * Converts a wall-clock date/time in `timeZone` to the UTC instant it represents. Uses two-pass
 * offset resolution so the result is correct across DST transitions (spring-forward / fall-back).
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guessMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset1 = offsetMinutesAt(timeZone, new Date(guessMs));
  const firstPassMs = guessMs - offset1 * 60_000;
  const offset2 = offsetMinutesAt(timeZone, new Date(firstPassMs));
  const finalMs = offset2 === offset1 ? firstPassMs : guessMs - offset2 * 60_000;
  return new Date(finalMs);
}

/**
 * Adds `days` to a zoned calendar date (calendar math only, no DST involved), then re-anchors the
 * result to `hour:minute` local time in `timeZone`.
 */
export function addDaysZoned(
  parts: Pick<ZonedParts, "year" | "month" | "day">,
  days: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naive = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return zonedTimeToUtc(
    naive.getUTCFullYear(),
    naive.getUTCMonth() + 1,
    naive.getUTCDate(),
    hour,
    minute,
    timeZone,
  );
}

/** `{ year, month }` shifted by `months` (may be negative), normalized to month 1-12. */
export function addMonths(
  parts: Pick<ZonedParts, "year" | "month">,
  months: number,
): { year: number; month: number } {
  const totalMonths = parts.year * 12 + (parts.month - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const month = (((totalMonths % 12) + 12) % 12) + 1;
  return { year, month };
}

/** "YYYY-MM" key for a zoned year/month, used for once-per-calendar-month idempotency checks. */
export function yearMonthKey(parts: Pick<ZonedParts, "year" | "month">): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

/** Full month name (e.g. "March"), locale-neutral. */
export function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}
