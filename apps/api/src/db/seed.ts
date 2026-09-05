/**
 * Demo seed: a realistic "Demo Family" for trying out the app or taking screenshots.
 *
 * Idempotent — running it again is a no-op once a family named "Demo Family" exists. Everything
 * is created through the same services the API routes use (ledger, children, allowances, goals,
 * requests) so every invariant (balances, idempotency keys, earmarks) holds, exactly as if a real
 * parent had clicked through the app. Ledger entries are backdated with `postedAt` to build up a
 * few months of history.
 *
 * Run with: `pnpm --filter @botf/api seed` (reads `DATABASE_URL`, or `apps/api/.env`).
 */
import { eq } from "drizzle-orm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config";
import { createDb, type Db } from "../db";
import { accounts, families, users } from "./schema";
import { createAllowance } from "../services/allowances";
import { createChild } from "../services/children";
import { allocateGoal, createGoal } from "../services/goals";
import { charge, deposit, reverse, transfer } from "../services/ledger";
import { notify } from "../services/notify";
import { createRequest } from "../services/requests";
import { upsertParentByAuthentikSub } from "../services/users";
import { createFamily } from "../services/families";

const DEMO_FAMILY_NAME = "Demo Family";
const DEMO_PARENT_SUB = "dev:demo-parent";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SeedResult {
  created: boolean;
  familyId?: string;
  parentAuthentikSub?: string;
  children?: { displayName: string; username: string; pin: string }[];
}

/** Days ago, at a fixed hour, so ordering is stable regardless of when the seed runs. */
function daysAgo(n: number, hour = 9): Date {
  const d = new Date(Date.now() - n * DAY_MS);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

async function seedChildHistory(
  db: Db,
  family: { id: string; currencyCode: string; locale: string },
  parentId: string,
  child: { userId: string; checkingId: string; savingsId: string },
): Promise<void> {
  // ~9 weeks of weekly allowance, oldest first, so running balances read correctly.
  for (let week = 9; week >= 1; week--) {
    await deposit(db, {
      familyId: family.id,
      accountId: child.checkingId,
      amountMinor: 1000,
      category: "allowance",
      memo: "Weekly allowance",
      createdByUserId: parentId,
      postedAt: daysAgo(week * 7),
    });
  }

  await deposit(db, {
    familyId: family.id,
    accountId: child.checkingId,
    amountMinor: 500,
    category: "chore",
    memo: "Cleaned the garage",
    createdByUserId: parentId,
    postedAt: daysAgo(40),
  });
  await deposit(db, {
    familyId: family.id,
    accountId: child.checkingId,
    amountMinor: 1500,
    category: "gift",
    memo: "Birthday money from Grandma",
    createdByUserId: parentId,
    postedAt: daysAgo(25),
  });
  await deposit(db, {
    familyId: family.id,
    accountId: child.checkingId,
    amountMinor: 300,
    category: "reward",
    memo: "Straight A's",
    createdByUserId: parentId,
    postedAt: daysAgo(20),
  });

  await charge(db, {
    familyId: family.id,
    accountId: child.checkingId,
    amountMinor: 899,
    category: "purchase",
    memo: "Comic book",
    createdByUserId: parentId,
    postedAt: daysAgo(15),
  });
  const mistakenCharge = await charge(db, {
    familyId: family.id,
    accountId: child.checkingId,
    amountMinor: 1200,
    category: "purchase",
    memo: "Video game (charged twice by mistake)",
    createdByUserId: parentId,
    postedAt: daysAgo(10),
  });
  await reverse(db, {
    familyId: family.id,
    transactionId: mistakenCharge.id,
    memo: "Reversed — charged in error",
    createdByUserId: parentId,
  });

  await transfer(db, {
    familyId: family.id,
    fromAccountId: child.checkingId,
    toAccountId: child.savingsId,
    amountMinor: 2000,
    memo: "Moving some into savings",
    createdByUserId: child.userId,
    postedAt: daysAgo(5),
  });
}

export async function runSeed(db: Db): Promise<SeedResult> {
  const [existing] = await db
    .select()
    .from(families)
    .where(eq(families.name, DEMO_FAMILY_NAME))
    .limit(1);
  if (existing) {
    return { created: false, familyId: existing.id };
  }

  const parentUser = await upsertParentByAuthentikSub(db, {
    authentikSub: DEMO_PARENT_SUB,
    displayName: "Demo Parent",
  });
  const family = await createFamily(db, parentUser.id, {
    name: DEMO_FAMILY_NAME,
    currencyCode: "USD",
    locale: "en-US",
    timezone: "America/Chicago",
  });
  // allocateGoal/createRequest want the raw DB row (Date fields), not the wire DTO.
  const [familyRow] = await db.select().from(families).where(eq(families.id, family.id)).limit(1);

  const kids = [
    { displayName: "Alex", username: "alex", pin: "1234" },
    { displayName: "Sam", username: "sam", pin: "5678" },
  ];

  for (const kid of kids) {
    const child = await createChild(db, family.id, {
      displayName: kid.displayName,
      username: kid.username,
      pin: kid.pin,
      withSavings: true,
      savingsInterestRateBps: 500, // 5%
    });
    const checking = child.accounts.find((a) => a.type === "checking")!;
    const savings = child.accounts.find((a) => a.type === "savings")!;

    await seedChildHistory(db, family, parentUser.id, {
      userId: child.user.id,
      checkingId: checking.id,
      savingsId: savings.id,
    });

    await createAllowance(db, family.id, parentUser.id, family.timezone, {
      accountId: checking.id,
      amountMinor: 1000,
      frequency: "weekly",
      dayOfWeek: 1, // Monday
      memo: "Weekly allowance",
    });

    const goal = await createGoal(
      db,
      family.id,
      { id: child.user.id, role: "child" },
      {
        accountId: savings.id,
        name: "New bike",
        emoji: "🚲",
        targetMinor: 20000,
      },
    );
    // Allocate whatever is sitting in savings toward the goal (partial progress).
    const [savingsRow] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, savings.id))
      .limit(1);
    if (savingsRow && savingsRow.balanceMinor > 0) {
      await allocateGoal(
        db,
        familyRow!,
        { id: child.user.id, role: "child" },
        goal.id,
        savingsRow.balanceMinor,
      );
    }
  }

  // One pending money request from the first kid.
  const childUsers = (await db.select().from(users).where(eq(users.familyId, family.id))).filter(
    (u) => u.role === "child",
  );
  if (childUsers[0]) {
    const childAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.ownerUserId, childUsers[0].id));
    const checking = childAccounts.find((a) => a.type === "checking");
    if (checking) {
      await createRequest(db, familyRow!, childUsers[0].id, {
        accountId: checking.id,
        amountMinor: 1500,
        reason: "New headphones",
      });
    }
  }

  await notify(db, {
    userId: parentUser.id,
    type: "system",
    title: "Welcome to Bank of the Family",
    body: "This is your demo family — explore accounts, allowances, goals and requests.",
    data: {},
  });

  return {
    created: true,
    familyId: family.id,
    parentAuthentikSub: DEMO_PARENT_SUB,
    children: kids,
  };
}

async function main() {
  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL);
  try {
    const result = await runSeed(db);
    if (!result.created) {
      console.log(
        `seed: "${DEMO_FAMILY_NAME}" already exists (familyId=${result.familyId}) — skipped`,
      );
      return;
    }
    console.log("seed: created Demo Family");
    console.log(
      `  Parent dev login: POST /api/auth/dev/login { authentikSub: "${result.parentAuthentikSub}" }`,
    );
    for (const kid of result.children ?? []) {
      console.log(
        `  Child login: username="${kid.username}" pin="${kid.pin}" (${kid.displayName})`,
      );
    }
  } finally {
    await pool.end();
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
