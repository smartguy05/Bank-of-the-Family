import { z } from "zod";
import { accountSchema } from "./account";
import { idSchema } from "./common";
import { transactionSchema } from "./transaction";
import { userSchema } from "./user";

export const childSummarySchema = z.object({
  user: userSchema,
  accounts: z.array(accountSchema),
  totalMinor: z.number().int(),
});
export type ChildSummary = z.infer<typeof childSummarySchema>;

export const parentDashboardSchema = z.object({
  totalMinor: z.number().int(),
  children: z.array(childSummarySchema),
  pendingRequestCount: z.number().int(),
  recentTransactions: z.array(transactionSchema),
});
export type ParentDashboard = z.infer<typeof parentDashboardSchema>;

export const childHomeSchema = z.object({
  accounts: z.array(accountSchema),
  totalMinor: z.number().int(),
  recentTransactions: z.array(transactionSchema),
  pendingRequestCount: z.number().int(),
  unreadNotifications: z.number().int(),
  parentIds: z.array(idSchema),
});
export type ChildHome = z.infer<typeof childHomeSchema>;
