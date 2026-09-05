import { z } from "zod";
import { familySchema } from "./family";
import { userSchema } from "./user";

/** The signed-in principal. `family` is null for a parent who has not created/joined a family yet. */
export const meSchema = z.object({
  user: userSchema,
  family: familySchema.nullable(),
  /** Present when a parent signed in while holding an invite code (pending join). */
  pendingInviteCode: z.string().nullable(),
});
export type Me = z.infer<typeof meSchema>;
