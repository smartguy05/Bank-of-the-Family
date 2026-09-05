import { z } from "zod";
import { TRANSACTION_CATEGORIES, TRANSACTION_KINDS } from "../enums";
import { idSchema, isoDateTime, memoSchema, pagingQuery, positiveAmountMinor } from "./common";

export const transactionSchema = z.object({
  id: idSchema,
  familyId: idSchema,
  accountId: idSchema,
  kind: z.enum(TRANSACTION_KINDS),
  category: z.enum(TRANSACTION_CATEGORIES),
  /** Signed: credits positive, debits negative. */
  amountMinor: z.number().int(),
  runningBalanceMinor: z.number().int(),
  memo: z.string(),
  createdByUserId: idSchema.nullable(),
  createdByName: z.string().nullable(),
  relatedTransactionId: idSchema.nullable(),
  /** For transfers: the other account. */
  counterpartyAccountId: idSchema.nullable(),
  counterpartyAccountName: z.string().nullable(),
  reversedByTransactionId: idSchema.nullable(),
  postedAt: isoDateTime,
});
export type Transaction = z.infer<typeof transactionSchema>;

export const transactionListQuery = pagingQuery.extend({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  kind: z.enum(TRANSACTION_KINDS).optional(),
  category: z.enum(TRANSACTION_CATEGORIES).optional(),
});
export type TransactionListQuery = z.infer<typeof transactionListQuery>;

export const depositBody = z.object({
  accountId: idSchema,
  amountMinor: positiveAmountMinor,
  category: z.enum(TRANSACTION_CATEGORIES).default("other"),
  memo: memoSchema.default(""),
  idempotencyKey: z.string().max(100).optional(),
});
export type DepositBody = z.infer<typeof depositBody>;

export const chargeBody = depositBody;
export type ChargeBody = z.infer<typeof chargeBody>;

export const transferBody = z.object({
  fromAccountId: idSchema,
  toAccountId: idSchema,
  amountMinor: positiveAmountMinor,
  memo: memoSchema.default(""),
  idempotencyKey: z.string().max(100).optional(),
});
export type TransferBody = z.infer<typeof transferBody>;

export const reverseBody = z.object({
  transactionId: idSchema,
  memo: memoSchema.default(""),
});
export type ReverseBody = z.infer<typeof reverseBody>;

/** Result of a transfer: both legs. */
export const transferResult = z.object({
  out: transactionSchema,
  in: transactionSchema,
});
export type TransferResult = z.infer<typeof transferResult>;
