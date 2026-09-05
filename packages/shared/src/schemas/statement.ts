import { z } from "zod";
import { idSchema } from "./common";
import { transactionSchema } from "./transaction";

export const statementPeriod = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

export const statementSchema = z.object({
  accountId: idSchema,
  accountName: z.string(),
  accountNumber: z.string(),
  ownerName: z.string(),
  familyName: z.string(),
  currencyCode: z.string(),
  locale: z.string(),
  period: statementPeriod,
  periodStart: z.string(),
  periodEnd: z.string(),
  openingBalanceMinor: z.number().int(),
  closingBalanceMinor: z.number().int(),
  totalCreditsMinor: z.number().int(),
  totalDebitsMinor: z.number().int(),
  interestMinor: z.number().int(),
  transactionCount: z.number().int(),
  transactions: z.array(transactionSchema),
});
export type Statement = z.infer<typeof statementSchema>;

export const statementPeriodListSchema = z.object({
  periods: z.array(statementPeriod),
});
