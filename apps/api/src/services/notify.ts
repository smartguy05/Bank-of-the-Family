import type { NotificationType } from "@botf/shared";
import type { Db } from "../db";
import { notifications } from "../db/schema";

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function notify(
  db: Db,
  input: NotifyInput,
): Promise<typeof notifications.$inferSelect> {
  const [row] = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ?? {},
    })
    .returning();
  await afterInsert(row!);
  return row!;
}

// TODO(web-push): once VAPID keys are configured, fan this out to the user's push subscriptions.
async function afterInsert(_row: typeof notifications.$inferSelect): Promise<void> {
  // no-op for now
}
