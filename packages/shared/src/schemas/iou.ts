import { z } from "zod";
import { IOU_STATUSES } from "../enums";
import { idSchema, isoDateTime, pagingQuery, positiveAmountMinor } from "./common";

/** Calendar date without a time component (YYYY-MM-DD), like `savingsGoal.targetDate`. */
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const iouPaymentSchema = z.object({
  id: idSchema,
  iouId: idSchema,
  amountMinor: z.number().int(),
  fromAccountId: idSchema,
  toAccountId: idSchema,
  outTransactionId: idSchema.nullable(),
  inTransactionId: idSchema.nullable(),
  paidByUserId: idSchema.nullable(),
  paidByName: z.string().nullable(),
  createdAt: isoDateTime,
});
export type IouPayment = z.infer<typeof iouPaymentSchema>;

export const iouSchema = z.object({
  id: idSchema,
  familyId: idSchema,
  /** Who owes the money. */
  debtorUserId: idSchema,
  debtorName: z.string(),
  /** Who is owed the money. */
  creditorUserId: idSchema,
  creditorName: z.string(),
  createdByUserId: idSchema.nullable(),
  createdByName: z.string().nullable(),
  amountMinor: z.number().int(),
  paidMinor: z.number().int(),
  /** `amountMinor - paidMinor`, derived server-side for convenience. */
  remainingMinor: z.number().int(),
  reason: z.string(),
  /** YYYY-MM-DD, display only — nothing is enforced on the due date. */
  dueDate: z.string().nullable(),
  status: z.enum(IOU_STATUSES),
  acceptedAt: isoDateTime.nullable(),
  settledAt: isoDateTime.nullable(),
  /** Set when declined, cancelled or forgiven. */
  closedAt: isoDateTime.nullable(),
  closedByUserId: idSchema.nullable(),
  /** Oldest first. */
  payments: z.array(iouPaymentSchema),
  createdAt: isoDateTime,
});
export type Iou = z.infer<typeof iouSchema>;

export const createIouBody = z.object({
  debtorUserId: idSchema,
  creditorUserId: idSchema,
  amountMinor: positiveAmountMinor,
  reason: z.string().trim().min(1).max(200),
  dueDate: dateOnly.optional(),
});
export type CreateIouBody = z.infer<typeof createIouBody>;

export const payIouBody = z.object({
  fromAccountId: idSchema,
  amountMinor: positiveAmountMinor,
});
export type PayIouBody = z.infer<typeof payIouBody>;

export const iouListQuery = pagingQuery.extend({ status: z.enum(IOU_STATUSES).optional() });
export type IouListQuery = z.infer<typeof iouListQuery>;
