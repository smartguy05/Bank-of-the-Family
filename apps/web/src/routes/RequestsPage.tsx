import { Inbox } from "lucide-react";
import { ComingSoon } from "@/components/ui/ComingSoon";

export function RequestsPage() {
  return (
    <ComingSoon
      title="Requests"
      icon={<Inbox size={28} />}
      description="Kids will be able to request money and parents will approve or decline right here."
    />
  );
}
