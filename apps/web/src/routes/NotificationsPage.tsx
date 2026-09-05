import { Bell } from "lucide-react";
import { ComingSoon } from "@/components/ui/ComingSoon";

export function NotificationsPage() {
  return (
    <ComingSoon
      title="Notifications"
      icon={<Bell size={28} />}
      description="Deposits, charges, allowance, and requests will show up here as they happen."
    />
  );
}
