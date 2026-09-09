import dayjs from "dayjs";
import { Link } from "@tanstack/react-router";
import type { Iou, IouPayment } from "@botf/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { IouStatusBadge } from "@/components/bank/IouStatusBadge";
import { iouDirectionLabel, iouProgressPct, isIouOverdue } from "@/lib/iou";
import { cn } from "@/lib/cn";

export interface IouCardProps {
  iou: Iou;
  meUserId: string;
  role: "parent" | "child";
  /** Debtor control, shown while pending and I'm the debtor. */
  onAccept?: (iou: Iou) => void;
  onDecline?: (iou: Iou) => void;
  /** Kid debtor (open) or parent (open, on the debtor's behalf) control. */
  onPay?: (iou: Iou) => void;
  /** Creator (while pending) or parent control. */
  onCancel?: (iou: Iou) => void;
  /** Parent-only, open IOUs. */
  onForgive?: (iou: Iou) => void;
  /** Parent-only, before anything has been paid. */
  onDelete?: (iou: Iou) => void;
  busy?: boolean;
}

/** The leg of a payment the current viewer is allowed to open a receipt for. */
function myLeg(
  payment: IouPayment,
  iou: Iou,
  meUserId: string,
  role: "parent" | "child",
): { accountId: string; txId: string } | null {
  if (role === "parent") {
    // Parents can only open the debtor's transactions here — the creditor's leg belongs to a
    // different child than the one this card is usually shown for.
    if (!payment.outTransactionId) return null;
    return { accountId: payment.fromAccountId, txId: payment.outTransactionId };
  }
  if (meUserId === iou.debtorUserId) {
    if (!payment.outTransactionId) return null;
    return { accountId: payment.fromAccountId, txId: payment.outTransactionId };
  }
  if (meUserId === iou.creditorUserId) {
    if (!payment.inTransactionId) return null;
    return { accountId: payment.toAccountId, txId: payment.inTransactionId };
  }
  return null;
}

export function IouCard({
  iou,
  meUserId,
  role,
  onAccept,
  onDecline,
  onPay,
  onCancel,
  onForgive,
  onDelete,
  busy,
}: IouCardProps) {
  const isDebtor = iou.debtorUserId === meUserId;
  const isCreditor = iou.creditorUserId === meUserId;
  const isCreator = iou.createdByUserId === meUserId;
  const otherPartyName = isDebtor ? iou.creditorName : isCreditor ? iou.debtorName : iou.debtorName;
  const overdue = isIouOverdue(iou);

  const showAcceptDecline = iou.status === "pending_acceptance" && isDebtor;
  const showCancel = iou.status === "pending_acceptance" && (isCreator || role === "parent");
  const showPayKid = iou.status === "open" && isDebtor && role === "child";
  const showPayParent = iou.status === "open" && role === "parent";
  const showForgive = iou.status === "open" && role === "parent";
  const showDelete = role === "parent" && iou.paidMinor === 0;
  const hasActions =
    showAcceptDecline || showCancel || showPayKid || showPayParent || showForgive || showDelete;

  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="flex items-start gap-3">
        <Avatar name={otherPartyName} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-ink">{iouDirectionLabel(iou, meUserId)}</p>
            <IouStatusBadge status={iou.status} />
          </div>
          <p className="text-sm text-ink">{iou.reason}</p>
          <p className="text-xs text-muted">{dayjs(iou.createdAt).format("MMM D, YYYY")}</p>
          {iou.createdByName && iou.createdByUserId !== meUserId && (
            <p className="text-xs text-muted">Recorded by {iou.createdByName}</p>
          )}
          {iou.dueDate && (
            <p className={cn("text-xs", overdue ? "font-medium text-warning" : "text-muted")}>
              Due {dayjs(iou.dueDate).format("MMM D, YYYY")}
              {overdue ? " · Overdue" : ""}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold tabular text-ink">
            <Money minor={iou.remainingMinor} />
          </p>
          {iou.paidMinor > 0 && (
            <p className="text-xs text-muted">
              of <Money minor={iou.amountMinor} />
            </p>
          )}
        </div>
      </div>

      {iou.paidMinor > 0 && (
        <div className="pl-11">
          <ProgressBar value={iouProgressPct(iou)} />
        </div>
      )}

      {hasActions && (
        <div className="flex flex-wrap gap-2 pl-11">
          {showAcceptDecline && (
            <>
              <Button size="sm" loading={busy} onClick={() => onAccept?.(iou)}>
                Accept
              </Button>
              <Button size="sm" variant="secondary" loading={busy} onClick={() => onDecline?.(iou)}>
                Decline
              </Button>
            </>
          )}
          {showCancel && (
            <Button size="sm" variant="secondary" loading={busy} onClick={() => onCancel?.(iou)}>
              Cancel
            </Button>
          )}
          {showPayKid && (
            <Button size="sm" loading={busy} onClick={() => onPay?.(iou)}>
              Pay
            </Button>
          )}
          {showPayParent && (
            <Button size="sm" loading={busy} onClick={() => onPay?.(iou)}>
              Pay from account
            </Button>
          )}
          {showForgive && (
            <Button size="sm" variant="secondary" loading={busy} onClick={() => onForgive?.(iou)}>
              Forgive
            </Button>
          )}
          {showDelete && (
            <Button size="sm" variant="danger" loading={busy} onClick={() => onDelete?.(iou)}>
              Delete
            </Button>
          )}
        </div>
      )}

      {iou.payments.length > 0 && (
        <details className="pl-11">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">
            {iou.payments.length} payment{iou.payments.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {iou.payments.map((p) => {
              const leg = myLeg(p, iou, meUserId, role);
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-ink">{p.paidByName ?? "Unknown"}</p>
                    <p className="text-xs text-muted">{dayjs(p.createdAt).format("MMM D, YYYY")}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Money minor={p.amountMinor} className="tabular" />
                    {leg && (
                      <Link
                        to="/accounts/$accountId"
                        params={{ accountId: leg.accountId }}
                        search={{ tx: leg.txId }}
                        className="text-xs font-medium text-brand-700 hover:underline"
                      >
                        View receipt
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
