import type { RequestStatus } from "@botf/shared";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";

const TONE: Record<RequestStatus, BadgeTone> = {
  pending: "warning",
  approved: "positive",
  declined: "negative",
  cancelled: "neutral",
};

const LABEL: Record<RequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <Badge tone={TONE[status]}>{LABEL[status]}</Badge>;
}
