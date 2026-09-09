import { describe, expect, it } from "vitest";
import type { Iou, IouStatus } from "@botf/shared";
import {
  groupIousForKid,
  groupIousForParent,
  iouDirectionLabel,
  iouProgressPct,
  isIouOverdue,
} from "@/lib/iou";

let nextId = 1;

function makeIou(overrides: Partial<Iou> = {}): Iou {
  const id = String(nextId++);
  return {
    id,
    familyId: "fam-1",
    debtorUserId: "debtor-1",
    debtorName: "Debtor",
    creditorUserId: "creditor-1",
    creditorName: "Creditor",
    createdByUserId: "creditor-1",
    createdByName: "Creditor",
    amountMinor: 1000,
    paidMinor: 0,
    remainingMinor: 1000,
    reason: "Lunch money",
    dueDate: null,
    status: "open",
    acceptedAt: null,
    settledAt: null,
    closedAt: null,
    closedByUserId: null,
    payments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("iouProgressPct", () => {
  it("returns 0 when nothing has been paid", () => {
    expect(iouProgressPct(makeIou({ amountMinor: 1000, paidMinor: 0 }))).toBe(0);
  });

  it("returns the paid fraction as a percent", () => {
    expect(iouProgressPct(makeIou({ amountMinor: 1000, paidMinor: 250 }))).toBe(25);
  });

  it("clamps to 100 when overpaid due to rounding", () => {
    expect(iouProgressPct(makeIou({ amountMinor: 1000, paidMinor: 1200 }))).toBe(100);
  });

  it("returns 0 for a zero amount instead of dividing by zero", () => {
    expect(iouProgressPct(makeIou({ amountMinor: 0, paidMinor: 0 }))).toBe(0);
  });
});

describe("isIouOverdue", () => {
  const today = new Date("2026-06-15T12:00:00.000Z");

  it("is false when there is no due date", () => {
    expect(isIouOverdue(makeIou({ status: "open", dueDate: null }), today)).toBe(false);
  });

  it("is false when the due date is in the future", () => {
    expect(isIouOverdue(makeIou({ status: "open", dueDate: "2026-07-01" }), today)).toBe(false);
  });

  it("is true when the due date has passed and the IOU is still open", () => {
    expect(isIouOverdue(makeIou({ status: "open", dueDate: "2026-06-01" }), today)).toBe(true);
  });

  it("is false when the IOU is no longer open, even if overdue", () => {
    expect(isIouOverdue(makeIou({ status: "settled", dueDate: "2026-06-01" }), today)).toBe(false);
  });
});

describe("iouDirectionLabel", () => {
  it("says 'You owe' when the viewer is the debtor", () => {
    const iou = makeIou({ debtorUserId: "me", creditorName: "Sam" });
    expect(iouDirectionLabel(iou, "me")).toBe("You owe Sam");
  });

  it("says '...owes you' when the viewer is the creditor", () => {
    const iou = makeIou({ creditorUserId: "me", debtorName: "Sam" });
    expect(iouDirectionLabel(iou, "me")).toBe("Sam owes you");
  });

  it("names both parties when the viewer is neither", () => {
    const iou = makeIou({ debtorName: "Alex", creditorName: "Sam" });
    expect(iouDirectionLabel(iou, "parent-1")).toBe("Alex owes Sam");
  });
});

describe("groupIousForKid", () => {
  const me = "me";

  it("buckets a pending IOU where I'm the debtor into needsOk", () => {
    const iou = makeIou({ status: "pending_acceptance", debtorUserId: me });
    expect(groupIousForKid([iou], me).needsOk).toEqual([iou]);
  });

  it("buckets an open IOU where I'm the debtor into youOwe", () => {
    const iou = makeIou({ status: "open", debtorUserId: me });
    expect(groupIousForKid([iou], me).youOwe).toEqual([iou]);
  });

  it("buckets a pending IOU where I'm the creditor into owedToYou", () => {
    const iou = makeIou({ status: "pending_acceptance", creditorUserId: me });
    expect(groupIousForKid([iou], me).owedToYou).toEqual([iou]);
  });

  it("buckets an open IOU where I'm the creditor into owedToYou", () => {
    const iou = makeIou({ status: "open", creditorUserId: me });
    expect(groupIousForKid([iou], me).owedToYou).toEqual([iou]);
  });

  it("buckets an active IOU between two siblings into betweenSiblings", () => {
    const iou = makeIou({ status: "open", debtorUserId: "a", creditorUserId: "b" });
    expect(groupIousForKid([iou], me).betweenSiblings).toEqual([iou]);
  });

  it("buckets closed statuses into history regardless of party", () => {
    const statuses: IouStatus[] = ["settled", "declined", "cancelled", "forgiven"];
    for (const status of statuses) {
      const iou = makeIou({ status, debtorUserId: me });
      expect(groupIousForKid([iou], me).history).toEqual([iou]);
    }
  });
});

describe("groupIousForParent", () => {
  it("buckets pending_acceptance and open as active", () => {
    const pending = makeIou({ status: "pending_acceptance" });
    const open = makeIou({ status: "open" });
    const groups = groupIousForParent([pending, open]);
    expect(groups.active).toEqual([pending, open]);
    expect(groups.history).toEqual([]);
  });

  it("buckets settled, declined, cancelled, and forgiven as history", () => {
    const statuses: IouStatus[] = ["settled", "declined", "cancelled", "forgiven"];
    const ious = statuses.map((status) => makeIou({ status }));
    const groups = groupIousForParent(ious);
    expect(groups.history).toEqual(ious);
    expect(groups.active).toEqual([]);
  });
});
