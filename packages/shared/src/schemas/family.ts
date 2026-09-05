import { z } from "zod";
import { currencyCode, idSchema, isoDateTime, localeTag, timezone } from "./common";

export const familySchema = z.object({
  id: idSchema,
  name: z.string(),
  currencyCode: z.string(),
  locale: z.string(),
  timezone: z.string(),
  allowOverdraft: z.boolean(),
  createdAt: isoDateTime,
});
export type Family = z.infer<typeof familySchema>;

export const createFamilyBody = z.object({
  name: z.string().trim().min(1).max(80),
  currencyCode: currencyCode.default("USD"),
  locale: localeTag.default("en-US"),
  timezone: timezone.default("UTC"),
});
export type CreateFamilyBody = z.infer<typeof createFamilyBody>;

export const updateFamilyBody = createFamilyBody.partial().extend({
  allowOverdraft: z.boolean().optional(),
});
export type UpdateFamilyBody = z.infer<typeof updateFamilyBody>;

export const familyInviteSchema = z.object({
  id: idSchema,
  familyId: idSchema,
  code: z.string(),
  inviteeName: z.string().nullable(),
  inviteeEmail: z.string().nullable(),
  createdBy: idSchema,
  expiresAt: isoDateTime,
  acceptedBy: idSchema.nullable(),
  acceptedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type FamilyInvite = z.infer<typeof familyInviteSchema>;

export const createInviteBody = z.object({
  inviteeName: z.string().trim().max(80).optional(),
  inviteeEmail: z.string().trim().email().max(200).optional(),
});
export type CreateInviteBody = z.infer<typeof createInviteBody>;

/** Public view of an invite (what the invitee sees before accepting). */
export const invitePreviewSchema = z.object({
  code: z.string(),
  familyName: z.string(),
  inviteeName: z.string().nullable(),
  invitedByName: z.string(),
  expiresAt: isoDateTime,
  valid: z.boolean(),
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

/** Invitee with no Authentik account: the app creates one, then they sign in. */
export const registerViaInviteBody = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dot, underscore, dash only"),
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200).optional(),
  password: z.string().min(8).max(200),
});
export type RegisterViaInviteBody = z.infer<typeof registerViaInviteBody>;

/** Response for POST /invites/:code/register: where to send the invitee to finish signing in. */
export const registerViaInviteResponse = z.object({
  ok: z.literal(true),
  loginUrl: z.string(),
});
export type RegisterViaInviteResponse = z.infer<typeof registerViaInviteResponse>;
