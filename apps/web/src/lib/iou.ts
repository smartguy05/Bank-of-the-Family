import type { Iou, IouStatus } from "@botf/shared";

const HISTORY_STATUSES: readonly IouStatus[] = ["settled", "declined", "cancelled", "forgiven"];
const ACTIVE_STATUSES: readonly IouStatus[] = ["pending_acceptance", "open"];

/** Percent of the IOU paid off so far, clamped to 0–100. */
export function iouProgressPct(iou: Iou): number {
  if (iou.amountMinor <= 0) return 0;
  const pct = (iou.paidMinor / iou.amountMinor) * 100;
  return Math.max(0, Math.min(100, pct));
}

function toDateOnlyString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** True when an open IOU has a due date that's already passed (date-only comparison). */
export function isIouOverdue(iou: Iou, today: Date = new Date()): boolean {
  if (iou.status !== "open" || !iou.dueDate) return false;
  return iou.dueDate < toDateOnlyString(today);
}

export interface KidIouGroups {
  /** pending_acceptance where I'm the debtor — I need to accept or decline. */
  needsOk: Iou[];
  /** open where I'm the debtor. */
  youOwe: Iou[];
  /** open or pending_acceptance where I'm the creditor. */
  owedToYou: Iou[];
  /** pending_acceptance or open where I'm neither party. */
  betweenSiblings: Iou[];
  /** settled, declined, cancelled, or forgiven, regardless of party. */
  history: Iou[];
}

export function groupIousForKid(ious: Iou[], meUserId: string): KidIouGroups {
  const groups: KidIouGroups = {
    needsOk: [],
    youOwe: [],
    owedToYou: [],
    betweenSiblings: [],
    history: [],
  };
  for (const iou of ious) {
    if (HISTORY_STATUSES.includes(iou.status)) {
      groups.history.push(iou);
      continue;
    }
    const isDebtor = iou.debtorUserId === meUserId;
    const isCreditor = iou.creditorUserId === meUserId;
    if (iou.status === "pending_acceptance" && isDebtor) {
      groups.needsOk.push(iou);
    } else if (isCreditor) {
      groups.owedToYou.push(iou);
    } else if (isDebtor) {
      groups.youOwe.push(iou);
    } else {
      groups.betweenSiblings.push(iou);
    }
  }
  return groups;
}

export interface ParentIouGroups {
  /** pending_acceptance or open. */
  active: Iou[];
  /** settled, declined, cancelled, or forgiven. */
  history: Iou[];
}

export function groupIousForParent(ious: Iou[]): ParentIouGroups {
  const groups: ParentIouGroups = { active: [], history: [] };
  for (const iou of ious) {
    (ACTIVE_STATUSES.includes(iou.status) ? groups.active : groups.history).push(iou);
  }
  return groups;
}

/** Short human sentence describing who owes whom, from the viewer's perspective. */
export function iouDirectionLabel(iou: Iou, meUserId: string): string {
  if (iou.debtorUserId === meUserId) return `You owe ${iou.creditorName}`;
  if (iou.creditorUserId === meUserId) return `${iou.debtorName} owes you`;
  return `${iou.debtorName} owes ${iou.creditorName}`;
}
