import type { IouStatus } from "@botf/shared";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";

const TONE: Record<IouStatus, BadgeTone> = {
  pending_acceptance: "warning",
  open: "brand",
  settled: "positive",
  declined: "negative",
  cancelled: "neutral",
  forgiven: "accent",
};

const LABEL: Record<IouStatus, string> = {
  pending_acceptance: "Needs OK",
  open: "Open",
  settled: "Settled",
  declined: "Declined",
  cancelled: "Cancelled",
  forgiven: "Forgiven",
};

export function IouStatusBadge({ status }: { status: IouStatus }) {
  return <Badge tone={TONE[status]}>{LABEL[status]}</Badge>;
}
