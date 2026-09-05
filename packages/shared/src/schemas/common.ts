import { z } from "zod";

export const idSchema = z.string().min(1).max(64);
export const isoDateTime = z.string().datetime({ offset: true });
export const currencyCode = z
  .string()
  .length(3)
  .regex(/^[A-Za-z]{3}$/)
  .transform((s) => s.toUpperCase());
export const localeTag = z.string().min(2).max(35);
export const timezone = z.string().min(1).max(64);

/** Non-negative integer amount in minor units. */
export const amountMinor = z.number().int().nonnegative().max(1_000_000_000);
/** Strictly positive integer amount in minor units. */
export const positiveAmountMinor = z.number().int().positive().max(1_000_000_000);

export const memoSchema = z.string().trim().max(200);

export const pagingQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PagingQuery = z.infer<typeof pagingQuery>;

export function paged<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const errorResponse = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
  code: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof errorResponse>;

export const okResponse = z.object({ ok: z.literal(true) });
