import { z } from "zod";
import { REQUEST_STATUSES } from "../enums";
import { idSchema, isoDateTime, memoSchema, pagingQuery, positiveAmountMinor } from "./common";

export const moneyRequestSchema = z.object({
  id: idSchema,
  familyId: idSchema,
  requesterUserId: idSchema,
  requesterName: z.string(),
  accountId: idSchema,
  accountName: z.string(),
  amountMinor: z.number().int(),
  reason: z.string(),
  status: z.enum(REQUEST_STATUSES),
  decidedBy: idSchema.nullable(),
  decidedByName: z.string().nullable(),
  decidedAt: isoDateTime.nullable(),
  decisionNote: z.string().nullable(),
  transactionId: idSchema.nullable(),
  createdAt: isoDateTime,
});
export type MoneyRequest = z.infer<typeof moneyRequestSchema>;

export const createRequestBody = z.object({
  accountId: idSchema,
  amountMinor: positiveAmountMinor,
  reason: z.string().trim().min(1).max(200),
});
export type CreateRequestBody = z.infer<typeof createRequestBody>;

export const decideRequestBody = z.object({
  note: memoSchema.default(""),
});
export type DecideRequestBody = z.infer<typeof decideRequestBody>;

export const requestListQuery = pagingQuery.extend({
  status: z.enum(REQUEST_STATUSES).optional(),
});
export type RequestListQuery = z.infer<typeof requestListQuery>;
