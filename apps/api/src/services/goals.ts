import type { CreateGoalBody, SavingsGoal as SavingsGoalDto, UpdateGoalBody } from "@botf/shared";
import { formatMoney } from "@botf/shared";
import { and, desc, eq } from "drizzle-orm";
import type { Db, Tx } from "../db";
import type { families } from "../db/schema";
import { accounts, savingsGoals } from "../db/schema";
import { conflict, notFound } from "../lib/errors";
import { earmarkedByAccount, getAccountOr404 } from "./accounts";

export interface GoalActor {
  id: string;
  role: "parent" | "child";
}

export function toGoalDto(row: typeof savingsGoals.$inferSelect): SavingsGoalDto {
  return {
    id: row.id,
    familyId: row.familyId,
    accountId: row.accountId,
    userId: row.userId,
    name: row.name,
    emoji: row.emoji,
    targetMinor: row.targetMinor,
    savedMinor: row.savedMinor,
    targetDate: row.targetDate,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listGoals(
  db: Db,
  params: { familyId: string; accountId?: string; ownerUserId?: string },
): Promise<SavingsGoalDto[]> {
  const conds = [eq(savingsGoals.familyId, params.familyId)];
  if (params.accountId) conds.push(eq(savingsGoals.accountId, params.accountId));
  if (params.ownerUserId) conds.push(eq(savingsGoals.userId, params.ownerUserId));
  const rows = await db
    .select()
    .from(savingsGoals)
    .where(and(...conds))
    .orderBy(desc(savingsGoals.createdAt));
  // Open goals first, completed after (stable: createdAt desc already applied within each group).
  const sorted = [...rows].sort((a, b) => Number(!!a.completedAt) - Number(!!b.completedAt));
  return sorted.map(toGoalDto);
}

export async function getGoalOr404(
  db: Db | Tx,
  familyId: string,
  id: string,
): Promise<typeof savingsGoals.$inferSelect> {
  const [row] = await db
    .select()
    .from(savingsGoals)
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.familyId, familyId)))
    .limit(1);
  if (!row) throw notFound("Goal");
  return row;
}

export async function createGoal(
  db: Db,
  familyId: string,
  actor: GoalActor,
  body: CreateGoalBody,
): Promise<SavingsGoalDto> {
  const account = await getAccountOr404(db, body.accountId, familyId);
  if (account.status !== "open") throw conflict("ACCOUNT_CLOSED", "This account is closed");
  // Children can only open goals on their own accounts; parents may open one for any child.
  if (actor.role === "child" && account.ownerUserId !== actor.id) throw notFound("Account");

  const [row] = await db
    .insert(savingsGoals)
    .values({
      familyId,
      accountId: account.id,
      userId: account.ownerUserId,
      name: body.name,
      emoji: body.emoji ?? null,
      targetMinor: body.targetMinor,
      targetDate: body.targetDate ?? null,
    })
    .returning();
  return toGoalDto(row!);
}

export async function updateGoal(
  db: Db,
  familyId: string,
  actor: GoalActor,
  id: string,
  body: UpdateGoalBody,
): Promise<SavingsGoalDto> {
  const current = await getGoalOr404(db, familyId, id);
  if (actor.role === "child" && current.userId !== actor.id) throw notFound("Goal");
  const [row] = await db.update(savingsGoals).set(body).where(eq(savingsGoals.id, id)).returning();
  return toGoalDto(row!);
}

export async function deleteGoal(
  db: Db,
  familyId: string,
  actor: GoalActor,
  id: string,
): Promise<void> {
  const current = await getGoalOr404(db, familyId, id);
  if (actor.role === "child" && current.userId !== actor.id) throw notFound("Goal");
  await db.delete(savingsGoals).where(eq(savingsGoals.id, id));
}

export interface AllocateResult {
  goal: SavingsGoalDto;
  /** True the moment savedMinor first reaches targetMinor as a result of this allocation. */
  reachedNow: boolean;
}

/**
 * Moves money into (positive) or out of (negative) a goal's earmark.
 *
 * This is a soft budgeting reservation, not a hold on the funds: it never touches the ledger, and
 * a parent's charge against the account still checks the account's *balance* (see
 * services/ledger.ts), not its *available* amount — so a charge can dip into money a kid has
 * earmarked for a goal. The earmark only affects what `GET /accounts` reports as `availableMinor`.
 */
export async function allocateGoal(
  db: Db,
  family: typeof families.$inferSelect,
  actor: GoalActor,
  id: string,
  amountMinor: number,
): Promise<AllocateResult> {
  return db.transaction(async (tx) => {
    const [goal] = await tx
      .select()
      .from(savingsGoals)
      .where(and(eq(savingsGoals.id, id), eq(savingsGoals.familyId, family.id)))
      .for("update");
    if (!goal) throw notFound("Goal");
    if (actor.role === "child" && goal.userId !== actor.id) throw notFound("Goal");
    if (goal.completedAt) throw conflict("GOAL_COMPLETED", "This goal is already complete");

    if (amountMinor > 0) {
      const [account] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, goal.accountId))
        .for("update");
      if (!account) throw notFound("Account");
      const earmarked = await earmarkedByAccount(tx, [account.id]);
      const availableMinor = account.balanceMinor - (earmarked.get(account.id) ?? 0);
      if (amountMinor > availableMinor) {
        throw conflict(
          "INSUFFICIENT_FUNDS",
          `Insufficient funds: ${formatMoney(availableMinor, family.currencyCode, family.locale)} available`,
        );
      }
    } else if (Math.abs(amountMinor) > goal.savedMinor) {
      throw conflict("INSUFFICIENT_FUNDS", "Cannot release more than is saved toward this goal");
    }

    const newSaved = goal.savedMinor + amountMinor;
    const [updated] = await tx
      .update(savingsGoals)
      .set({ savedMinor: newSaved })
      .where(eq(savingsGoals.id, id))
      .returning();
    const reachedNow = goal.savedMinor < goal.targetMinor && newSaved >= goal.targetMinor;
    return { goal: toGoalDto(updated!), reachedNow };
  });
}

export async function completeGoal(
  db: Db,
  familyId: string,
  actor: GoalActor,
  id: string,
): Promise<SavingsGoalDto> {
  const current = await getGoalOr404(db, familyId, id);
  if (actor.role === "child" && current.userId !== actor.id) throw notFound("Goal");
  const [row] = await db
    .update(savingsGoals)
    .set({ completedAt: new Date() })
    .where(eq(savingsGoals.id, id))
    .returning();
  return toGoalDto(row!);
}
