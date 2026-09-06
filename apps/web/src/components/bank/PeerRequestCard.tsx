import dayjs from "dayjs";
import { Link } from "@tanstack/react-router";
import type { PeerRequest } from "@botf/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { RequestStatusBadge } from "@/components/bank/RequestStatusBadge";

export interface PeerRequestCardProps {
  request: PeerRequest;
  meUserId: string;
  /** Payer controls, shown while pending. */
  onApprove?: (request: PeerRequest) => void;
  onDecline?: (request: PeerRequest) => void;
  /** Requester control, shown while pending. */
  onCancel?: (request: PeerRequest) => void;
  cancelling?: boolean;
}

export function PeerRequestCard({
  request,
  meUserId,
  onApprove,
  onDecline,
  onCancel,
  cancelling,
}: PeerRequestCardProps) {
  const isPayer = meUserId === request.payerUserId;
  const isRequester = meUserId === request.requesterUserId;
  const otherName = isPayer ? request.requesterName : request.payerName;
  const direction = isPayer ? `${request.requesterName} → You` : `You → ${request.payerName}`;

  const myTransactionId = isPayer ? request.payerTransactionId : request.requesterTransactionId;
  const myAccountId = isPayer ? request.payerAccountId : request.requesterAccountId;

  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="flex items-start gap-3">
        <Avatar name={otherName} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-ink">{direction}</p>
            <RequestStatusBadge status={request.status} />
          </div>
          <p className="text-sm text-ink">{request.reason}</p>
          <p className="text-xs text-muted">{dayjs(request.createdAt).format("MMM D, YYYY")}</p>
          {request.decisionNote &&
            (request.status === "declined" || request.status === "approved") && (
              <p className="mt-1 text-xs text-muted">
                <span className="font-medium">Note:</span> {request.decisionNote}
              </p>
            )}
        </div>
        <p className="shrink-0 text-lg font-semibold tabular text-ink">
          <Money minor={request.amountMinor} />
        </p>
      </div>

      {request.status === "pending" && isPayer && (onApprove || onDecline) && (
        <div className="flex gap-2 pl-11">
          <Button size="sm" onClick={() => onApprove?.(request)}>
            Approve
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onDecline?.(request)}>
            Decline
          </Button>
        </div>
      )}

      {request.status === "pending" && isRequester && onCancel && (
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

      {request.status === "approved" && myTransactionId && myAccountId && (
        <div className="pl-11">
          <Link
            to="/accounts/$accountId"
            params={{ accountId: myAccountId }}
            search={{ tx: myTransactionId }}
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            View receipt
          </Link>
        </div>
      )}
    </div>
  );
}
