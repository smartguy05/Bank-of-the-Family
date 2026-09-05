import { z } from "zod";
import { idSchema, isoDateTime, positiveAmountMinor } from "./common";

export const savingsGoalSchema = z.object({
  id: idSchema,
  familyId: idSchema,
  accountId: idSchema,
  userId: idSchema,
  name: z.string(),
  emoji: z.string().nullable(),
  targetMinor: z.number().int(),
  savedMinor: z.number().int(),
  targetDate: z.string().nullable(), // YYYY-MM-DD
  completedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type SavingsGoal = z.infer<typeof savingsGoalSchema>;

export const createGoalBody = z.object({
  accountId: idSchema,
  name: z.string().trim().min(1).max(60),
  emoji: z.string().max(8).optional(),
  targetMinor: positiveAmountMinor,
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type CreateGoalBody = z.infer<typeof createGoalBody>;

export const updateGoalBody = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  emoji: z.string().max(8).nullable().optional(),
  targetMinor: positiveAmountMinor.optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});
export type UpdateGoalBody = z.infer<typeof updateGoalBody>;

/** Move money into (positive) or out of (negative) a goal's earmark. */
export const allocateGoalBody = z.object({
  amountMinor: z
    .number()
    .int()
    .refine((n) => n !== 0, "Amount cannot be zero"),
});
export type AllocateGoalBody = z.infer<typeof allocateGoalBody>;
