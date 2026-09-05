import type { User as UserDto } from "@botf/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { users } from "../db/schema";

export function toUserDto(u: typeof users.$inferSelect): UserDto {
  return {
    id: u.id,
    familyId: u.familyId,
    role: u.role,
    displayName: u.displayName,
    username: u.username,
    avatarColor: u.avatarColor,
    avatarEmoji: u.avatarEmoji,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
  };
}

/** Create-or-update the parent user for an Authentik `sub`. Used by OIDC callback and dev login. */
export async function upsertParentByAuthentikSub(
  db: Db,
  { authentikSub, displayName }: { authentikSub: string; displayName: string },
): Promise<typeof users.$inferSelect> {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.authentikSub, authentikSub))
    .limit(1);
  if (existing) {
    const [updated] = await db
      .update(users)
      .set({ displayName })
      .where(eq(users.id, existing.id))
      .returning();
    return updated!;
  }
  const [created] = await db
    .insert(users)
    .values({ role: "parent", authentikSub, displayName })
    .returning();
  return created!;
}
