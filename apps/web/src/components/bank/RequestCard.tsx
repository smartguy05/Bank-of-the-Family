import dayjs from "dayjs";
import { Link } from "@tanstack/react-router";
import type { MoneyRequest } from "@botf/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { RequestStatusBadge } from "@/components/bank/RequestStatusBadge";

export interface RequestCardProps {
  request: MoneyRequest;
  /** Parent controls. */
  onApprove?: (request: MoneyRequest) => void;
  onDecline?: (request: MoneyRequest) => void;
  /** Kid control. */
  onCancel?: (request: MoneyRequest) => void;
  cancelling?: boolean;
}

export function RequestCard({
  request,
  onApprove,
  onDecline,
  onCancel,
  cancelling,
}: RequestCardProps) {
  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="flex items-start gap-3">
        <Avatar name={request.requesterName} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-ink">{request.requesterName}</p>
            <RequestStatusBadge status={request.status} />
          </div>
          <p className="text-sm text-ink">{request.reason}</p>
          <p className="text-xs text-muted">
            {request.accountName} · {dayjs(request.createdAt).format("MMM D, YYYY")}
          </p>
          {request.status === "declined" && request.decisionNote && (
            <p className="mt-1 text-xs text-muted">
              <span className="font-medium">Note:</span> {request.decisionNote}
            </p>
          )}
          {request.status === "approved" && request.decisionNote && (
            <p className="mt-1 text-xs text-muted">
              <span className="font-medium">Note:</span> {request.decisionNote}
            </p>
          )}
        </div>
        <p className="shrink-0 text-lg font-semibold tabular text-ink">
          <Money minor={request.amountMinor} />
        </p>
      </div>

      {request.status === "pending" && (onApprove || onDecline) && (
        <div className="flex gap-2 pl-11">
          <Button size="sm" onClick={() => onApprove?.(request)}>
            Approve
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onDecline?.(request)}>
            Decline
          </Button>
        </div>
      )}

      {request.status === "pending" && onCancel && (
        <div className="pl-11">
          <Button
            size="sm"
            variant="secondary"
            loading={cancelling}
            onClick={() => onCancel(request)}
          >
            Cancel request
          </Button>
        </div>
      )}

      {request.status === "approved" && request.transactionId && (
        <div className="pl-11">
          <Link
            to="/accounts/$accountId"
            params={{ accountId: request.accountId }}
            search={{ tx: request.transactionId }}
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            View receipt
          </Link>
        </div>
      )}
    </div>
  );
}
