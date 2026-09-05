import { z } from "zod";
import { ALLOWANCE_FREQUENCIES } from "../enums";
import { idSchema, isoDateTime, memoSchema, positiveAmountMinor } from "./common";

export const allowanceScheduleSchema = z.object({
  id: idSchema,
  familyId: idSchema,
  accountId: idSchema,
  amountMinor: z.number().int(),
  frequency: z.enum(ALLOWANCE_FREQUENCIES),
  /** 0 = Sunday … 6 = Saturday. Used for weekly/biweekly. */
  dayOfWeek: z.number().int().min(0).max(6).nullable(),
  /** 1..28. Used for monthly. */
  dayOfMonth: z.number().int().min(1).max(28).nullable(),
  memo: z.string(),
  nextRunAt: isoDateTime,
  lastRunAt: isoDateTime.nullable(),
  active: z.boolean(),
  createdBy: idSchema,
  createdAt: isoDateTime,
});
export type AllowanceSchedule = z.infer<typeof allowanceScheduleSchema>;

export const createAllowanceBody = z
  .object({
    accountId: idSchema,
    amountMinor: positiveAmountMinor,
    frequency: z.enum(ALLOWANCE_FREQUENCIES),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(28).optional(),
    memo: memoSchema.default("Allowance"),
    /** Optional explicit first run; otherwise computed from frequency/day in the family timezone. */
    startAt: isoDateTime.optional(),
  })
  .refine(
    (b) => (b.frequency === "monthly" ? b.dayOfMonth !== undefined : b.dayOfWeek !== undefined),
    { message: "dayOfMonth is required for monthly; dayOfWeek for weekly/biweekly" },
  );
export type CreateAllowanceBody = z.infer<typeof createAllowanceBody>;

export const updateAllowanceBody = z.object({
  amountMinor: positiveAmountMinor.optional(),
  frequency: z.enum(ALLOWANCE_FREQUENCIES).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  memo: memoSchema.optional(),
  active: z.boolean().optional(),
});
export type UpdateAllowanceBody = z.infer<typeof updateAllowanceBody>;
