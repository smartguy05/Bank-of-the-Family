import { z } from "zod";
import { ACCOUNT_STATUSES, ACCOUNT_TYPES } from "../enums";
import { idSchema, isoDateTime } from "./common";

export const accountSchema = z.object({
  id: idSchema,
  familyId: idSchema,
  ownerUserId: idSchema,
  type: z.enum(ACCOUNT_TYPES),
  name: z.string(),
  /** Display-only, e.g. "4821-0093-1207". */
  accountNumber: z.string(),
  interestRateBps: z.number().int(),
  /** Ledger balance in minor units. */
  balanceMinor: z.number().int(),
  /** balance minus money earmarked in open savings goals. */
  availableMinor: z.number().int(),
  lastInterestPostedAt: isoDateTime.nullable(),
  status: z.enum(ACCOUNT_STATUSES),
  createdAt: isoDateTime,
});
export type Account = z.infer<typeof accountSchema>;

export const createAccountBody = z.object({
  ownerUserId: idSchema,
  type: z.enum(ACCOUNT_TYPES),
  name: z.string().trim().min(1).max(60).optional(),
  interestRateBps: z.number().int().min(0).max(10000).default(0),
});
export type CreateAccountBody = z.infer<typeof createAccountBody>;

export const updateAccountBody = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  interestRateBps: z.number().int().min(0).max(10000).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
});
export type UpdateAccountBody = z.infer<typeof updateAccountBody>;
