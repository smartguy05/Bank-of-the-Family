import { z } from "zod";
import { REQUEST_STATUSES } from "../enums";
import { idSchema, isoDateTime, memoSchema, positiveAmountMinor } from "./common";

export const peerRequestSchema = z.object({
  id: idSchema,
  familyId: idSchema,
  requesterUserId: idSchema,
  requesterName: z.string(),
  requesterAccountId: idSchema,
  requesterAccountName: z.string(),
  payerUserId: idSchema,
  payerName: z.string(),
  payerAccountId: idSchema.nullable(),
  payerAccountName: z.string().nullable(),
  amountMinor: z.number().int(),
  reason: z.string(),
  status: z.enum(REQUEST_STATUSES),
  decidedAt: isoDateTime.nullable(),
  decisionNote: z.string().nullable(),
  payerTransactionId: idSchema.nullable(),
  requesterTransactionId: idSchema.nullable(),
  createdAt: isoDateTime,
});
export type PeerRequest = z.infer<typeof peerRequestSchema>;

export const createPeerRequestBody = z.object({
  payerUserId: idSchema,
  requesterAccountId: idSchema,
  amountMinor: positiveAmountMinor,
  reason: z.string().trim().min(1).max(200),
});
export type CreatePeerRequestBody = z.infer<typeof createPeerRequestBody>;

export const approvePeerRequestBody = z.object({
  fromAccountId: idSchema,
  note: memoSchema.default(""),
});
export type ApprovePeerRequestBody = z.infer<typeof approvePeerRequestBody>;
