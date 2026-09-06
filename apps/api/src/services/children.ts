import type { ChildSummary, CreateChildBody, UpdateChildBody, User as UserDto } from "@botf/shared";
import { generateAccountNumber } from "@botf/shared";
import argon2 from "argon2";
import { and, eq } from "drizzle-orm";
import type { Db, Tx } from "../db";
import { accounts, users } from "../db/schema";
import { conflict, notFound } from "../lib/errors";
import { isUniqueViolation } from "../lib/db-errors";
import { accountOrder, earmarkedByAccount, toAccountDto } from "./accounts";
import { toUserDto } from "./users";

const AVATAR_PALETTE = [
  "#1e3a8a",
  "#065f46",
  "#7c2d12",
  "#4c1d95",
  "#831843",
  "#0c4a6e",
  "#78350f",
  "#134e4a",
] as const;

function pickAvatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]!;
}

async function buildChildSummary(db: Db, user: typeof users.$inferSelect): Promise<ChildSummary> {
  const accts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.ownerUserId, user.id))
    .orderBy(...accountOrder);
  const earmarked = await earmarkedByAccount(
    db,
    accts.map((a) => a.id),
  );
  const accountDtos = accts.map((a) => toAccountDto(a, earmarked.get(a.id) ?? 0));
  const totalMinor = accountDtos.reduce((sum, a) => sum + a.balanceMinor, 0);
  return { user: toUserDto(user), accounts: accountDtos, totalMinor };
}

export async function listChildren(db: Db, familyId: string): Promise<ChildSummary[]> {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.familyId, familyId), eq(users.role, "child")));
  const sorted = [...rows].sort((a, b) => Number(b.isActive) - Number(a.isActive));
  return Promise.all(sorted.map((u) => buildChildSummary(db, u)));
}

export async function getChild(db: Db, familyId: string, id: string): Promise<ChildSummary> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.familyId, familyId), eq(users.role, "child")))
    .limit(1);
  if (!user) throw notFound("Child");
  return buildChildSummary(db, user);
}

async function insertAccountForChild(
  tx: Tx,
  input: {
    familyId: string;
    ownerUserId: string;
    type: "checking" | "savings";
    name: string;
    interestRateBps: number;
  },
): Promise<typeof accounts.$inferSelect> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [account] = await tx
        .insert(accounts)
        .values({ ...input, accountNumber: generateAccountNumber() })
        .returning();
      return account!;
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }
  throw new Error("Could not generate a unique account number");
}

export async function createChild(
  db: Db,
  familyId: string,
  body: CreateChildBody,
): Promise<ChildSummary> {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.username, body.username))
    .limit(1);
  if (existing) throw conflict("USERNAME_TAKEN", "That username is already taken");

  const pinHash = await argon2.hash(body.pin);
  try {
    return await db.transaction(async (tx) => {
      const [child] = await tx
        .insert(users)
        .values({
          familyId,
          role: "child",
          displayName: body.displayName,
          username: body.username,
          pinHash,
          avatarColor: body.avatarColor ?? pickAvatarColor(body.username),
          avatarEmoji: body.avatarEmoji,
        })
        .returning();

      const created = [
        await insertAccountForChild(tx, {
          familyId,
          ownerUserId: child!.id,
          type: "checking",
          name: "Checking",
          interestRateBps: 0,
        }),
      ];
      if (body.withSavings) {
        created.push(
          await insertAccountForChild(tx, {
            familyId,
            ownerUserId: child!.id,
            type: "savings",
            name: "Savings",
            interestRateBps: body.savingsInterestRateBps,
          }),
        );
      }

      const accountDtos = created.map((a) => toAccountDto(a, 0));
      return {
        user: toUserDto(child!),
        accounts: accountDtos,
        totalMinor: accountDtos.reduce((sum, a) => sum + a.balanceMinor, 0),
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("USERNAME_TAKEN", "That username is already taken");
    throw err;
  }
}

export async function updateChild(
  db: Db,
  familyId: string,
  id: string,
  body: UpdateChildBody,
): Promise<UserDto> {
  const [current] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.familyId, familyId), eq(users.role, "child")))
    .limit(1);
  if (!current) throw notFound("Child");

  if (body.username) {
    const [clash] = await db.select().from(users).where(eq(users.username, body.username)).limit(1);
    if (clash && clash.id !== id)
      throw conflict("USERNAME_TAKEN", "That username is already taken");
  }

  try {
    const [updated] = await db.update(users).set(body).where(eq(users.id, id)).returning();
    return toUserDto(updated!);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("USERNAME_TAKEN", "That username is already taken");
    throw err;
  }
}

export async function resetChildPin(
  db: Db,
  familyId: string,
  id: string,
  pin: string,
): Promise<void> {
  const [current] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.familyId, familyId), eq(users.role, "child")))
    .limit(1);
  if (!current) throw notFound("Child");
  const pinHash = await argon2.hash(pin);
  await db
    .update(users)
    .set({ pinHash, pinFailedAttempts: 0, pinLockedUntil: null })
    .where(eq(users.id, id));
}
