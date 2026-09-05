import type {
  CreateFamilyBody,
  CreateInviteBody,
  Family as FamilyDto,
  FamilyInvite as FamilyInviteDto,
  InvitePreview,
  RegisterViaInviteBody,
  RegisterViaInviteResponse,
  UpdateFamilyBody,
  User as UserDto,
} from "@botf/shared";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Config } from "../config";
import type { Db } from "../db";
import { families, familyInvites, users } from "../db/schema";
import { badRequest, conflict, gone, notFound } from "../lib/errors";
import { createAuthentikUser, findGroupIdByName, setAuthentikPassword } from "./authentik";
import { toUserDto } from "./users";

const INVITE_TTL_DAYS = 7;

export function toFamilyDto(f: typeof families.$inferSelect): FamilyDto {
  return {
    id: f.id,
    name: f.name,
    currencyCode: f.currencyCode,
    locale: f.locale,
    timezone: f.timezone,
    allowOverdraft: f.allowOverdraft,
    createdAt: f.createdAt.toISOString(),
  };
}

export function toInviteDto(i: typeof familyInvites.$inferSelect): FamilyInviteDto {
  return {
    id: i.id,
    familyId: i.familyId,
    code: i.code,
    inviteeName: i.inviteeName,
    inviteeEmail: i.inviteeEmail,
    createdBy: i.createdBy,
    expiresAt: i.expiresAt.toISOString(),
    acceptedBy: i.acceptedBy,
    acceptedAt: i.acceptedAt ? i.acceptedAt.toISOString() : null,
    createdAt: i.createdAt.toISOString(),
  };
}

export function assertValidCurrency(code: string): void {
  try {
    // Intl.NumberFormat happily accepts any well-formed (3-letter) code, real or not, so also
    // check it against the engine's actual list of known ISO 4217 currencies.
    const upper = code.toUpperCase();
    if (!Intl.supportedValuesOf("currency").includes(upper)) {
      throw new Error("unknown currency");
    }
    new Intl.NumberFormat("en-US", { style: "currency", currency: upper });
  } catch {
    throw badRequest("INVALID_CURRENCY", `Invalid currency code: ${code}`);
  }
}

export function assertValidTimezone(tz: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    throw badRequest("INVALID_TIMEZONE", `Invalid timezone: ${tz}`);
  }
}

export async function createFamily(
  db: Db,
  userId: string,
  body: CreateFamilyBody,
): Promise<FamilyDto> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw notFound("User");
    if (user.familyId) throw conflict("FAMILY_EXISTS", "You already belong to a family");
    const [family] = await tx
      .insert(families)
      .values({
        name: body.name,
        currencyCode: body.currencyCode,
        locale: body.locale,
        timezone: body.timezone,
      })
      .returning();
    await tx.update(users).set({ familyId: family!.id }).where(eq(users.id, userId));
    return toFamilyDto(family!);
  });
}

export async function updateFamily(
  db: Db,
  familyId: string,
  body: UpdateFamilyBody,
): Promise<FamilyDto> {
  const [updated] = await db
    .update(families)
    .set(body)
    .where(eq(families.id, familyId))
    .returning();
  if (!updated) throw notFound("Family");
  return toFamilyDto(updated);
}

export async function listParents(db: Db, familyId: string): Promise<UserDto[]> {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.familyId, familyId), eq(users.role, "parent")));
  return rows.map(toUserDto);
}

export async function listInvites(db: Db, familyId: string): Promise<FamilyInviteDto[]> {
  const rows = await db
    .select()
    .from(familyInvites)
    .where(eq(familyInvites.familyId, familyId))
    .orderBy(desc(familyInvites.createdAt));
  const now = Date.now();
  const isActive = (i: (typeof rows)[number]) => !i.acceptedAt && i.expiresAt.getTime() > now;
  const sorted = [...rows].sort((a, b) => Number(isActive(b)) - Number(isActive(a)));
  return sorted.map(toInviteDto);
}

export async function createInvite(
  db: Db,
  input: { familyId: string; createdBy: string; body: CreateInviteBody },
): Promise<FamilyInviteDto> {
  const [invite] = await db
    .insert(familyInvites)
    .values({
      familyId: input.familyId,
      code: nanoid(10),
      inviteeName: input.body.inviteeName ?? null,
      inviteeEmail: input.body.inviteeEmail ?? null,
      createdBy: input.createdBy,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    })
    .returning();
  return toInviteDto(invite!);
}

export async function deleteInvite(db: Db, familyId: string, id: string): Promise<void> {
  const result = await db
    .delete(familyInvites)
    .where(and(eq(familyInvites.id, id), eq(familyInvites.familyId, familyId)))
    .returning({ id: familyInvites.id });
  if (result.length === 0) throw notFound("Invite");
}

export async function getInvitePreview(db: Db, code: string): Promise<InvitePreview> {
  const [invite] = await db
    .select()
    .from(familyInvites)
    .where(eq(familyInvites.code, code))
    .limit(1);
  if (!invite) throw notFound("Invite");
  const [family] = await db
    .select()
    .from(families)
    .where(eq(families.id, invite.familyId))
    .limit(1);
  const [creator] = await db.select().from(users).where(eq(users.id, invite.createdBy)).limit(1);
  const valid = !invite.acceptedAt && invite.expiresAt.getTime() > Date.now();
  return {
    code: invite.code,
    familyName: family?.name ?? "",
    inviteeName: invite.inviteeName,
    invitedByName: creator?.displayName ?? "",
    expiresAt: invite.expiresAt.toISOString(),
    valid,
  };
}

/** Joins a signed-in parent (with no existing family) to the invite's family. Returns the familyId. */
export async function acceptInviteForUser(
  db: Db,
  { code, userId }: { code: string; userId: string },
): Promise<string> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw notFound("User");
    if (user.familyId) throw conflict("FAMILY_EXISTS", "You already belong to a family");

    const [invite] = await tx
      .select()
      .from(familyInvites)
      .where(eq(familyInvites.code, code))
      .limit(1);
    if (!invite) throw notFound("Invite");
    if (invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
      throw gone("INVITE_INVALID", "This invite is no longer valid");
    }

    await tx
      .update(familyInvites)
      .set({ acceptedBy: userId, acceptedAt: new Date() })
      .where(eq(familyInvites.id, invite.id));
    await tx.update(users).set({ familyId: invite.familyId }).where(eq(users.id, userId));
    return invite.familyId;
  });
}

/** For invitees with no Authentik account yet: creates one via the Authentik API. */
export async function registerViaInvite(
  db: Db,
  config: Config,
  input: { code: string; body: RegisterViaInviteBody; fetchImpl?: typeof fetch },
): Promise<RegisterViaInviteResponse> {
  const [invite] = await db
    .select()
    .from(familyInvites)
    .where(eq(familyInvites.code, input.code))
    .limit(1);
  if (!invite) throw notFound("Invite");
  if (invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
    throw gone("INVITE_INVALID", "This invite is no longer valid");
  }

  const groupId = await findGroupIdByName(config, config.AUTHENTIK_PARENT_GROUP, input.fetchImpl);
  const user = await createAuthentikUser(
    config,
    {
      username: input.body.username,
      name: input.body.name,
      email: input.body.email,
      groupId,
    },
    input.fetchImpl,
  );
  await setAuthentikPassword(config, user.pk, input.body.password, input.fetchImpl);

  return { ok: true as const, loginUrl: `/api/auth/oidc/login?invite=${input.code}` };
}
