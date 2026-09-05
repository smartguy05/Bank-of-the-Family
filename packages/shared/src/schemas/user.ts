import { z } from "zod";
import { USER_ROLES } from "../enums";
import { idSchema, isoDateTime } from "./common";

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dot, underscore, dash only")
  .transform((s) => s.toLowerCase());

export const pinSchema = z.string().regex(/^\d{4,6}$/, "PIN must be 4 to 6 digits");

export const userSchema = z.object({
  id: idSchema,
  familyId: idSchema.nullable(),
  role: z.enum(USER_ROLES),
  displayName: z.string(),
  username: z.string().nullable(),
  avatarColor: z.string(),
  avatarEmoji: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: isoDateTime,
});
export type User = z.infer<typeof userSchema>;

export const childLoginBody = z.object({ username: usernameSchema, pin: pinSchema });
export type ChildLoginBody = z.infer<typeof childLoginBody>;

export const changePinBody = z.object({ currentPin: pinSchema, newPin: pinSchema });
export type ChangePinBody = z.infer<typeof changePinBody>;

export const createChildBody = z.object({
  displayName: z.string().trim().min(1).max(60),
  username: usernameSchema,
  pin: pinSchema,
  avatarColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  avatarEmoji: z.string().max(8).optional(),
  /** Create a Savings account alongside the default Checking account. */
  withSavings: z.boolean().default(true),
  savingsInterestRateBps: z.number().int().min(0).max(10000).default(0),
});
export type CreateChildBody = z.infer<typeof createChildBody>;

export const updateChildBody = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  username: usernameSchema.optional(),
  avatarColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  avatarEmoji: z.string().max(8).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateChildBody = z.infer<typeof updateChildBody>;

export const resetPinBody = z.object({ pin: pinSchema });
export type ResetPinBody = z.infer<typeof resetPinBody>;
