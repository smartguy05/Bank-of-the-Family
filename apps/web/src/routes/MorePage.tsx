import { Link } from "@tanstack/react-router";
import { Bell, ChevronRight, FileText, Settings, User } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { useMe } from "@/hooks/useMe";

export function MorePage() {
  const { data: me } = useMe();
  const isParent = me?.user.role === "parent";

  const items = [
    ...(isParent ? [{ label: "Settings", to: "/settings", icon: Settings }] : []),
    { label: "Notifications", to: "/notifications", icon: Bell },
    ...(!isParent ? [{ label: "Statements", to: "/statements", icon: FileText }] : []),
    { label: "Profile", to: "/profile", icon: User },
  ];

  return (
    <div>
      <PageHeader title="More" />
      <Card className="divide-y divide-line">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface first:rounded-t-card last:rounded-b-card"
          >
            <item.icon size={18} className="text-muted" />
            <span className="flex-1 text-sm font-medium text-ink">{item.label}</span>
            <ChevronRight size={18} className="text-muted" />
          </Link>
        ))}
      </Card>
    </div>
  );
}
