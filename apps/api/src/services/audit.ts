import type { Db, Tx } from "../db";
import { auditLog } from "../db/schema";

export interface AuditInput {
  familyId?: string | null;
  actorUserId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  data?: Record<string, unknown>;
}

export async function audit(db: Db | Tx, input: AuditInput): Promise<void> {
  await db.insert(auditLog).values({
    familyId: input.familyId ?? null,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    data: input.data ?? {},
  });
}
