import { Link } from "@tanstack/react-router";
import type { ChildSummary } from "@botf/shared";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Money } from "@/components/ui/Money";
import { ChevronRight } from "lucide-react";

export function ChildCard({ child }: { child: ChildSummary }) {
  return (
    <Link
      to="/children/$childId"
      params={{ childId: child.user.id }}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded-card"
    >
      <Card className="p-4 transition-shadow hover:shadow-md">
        <div className="flex items-center gap-3">
          <Avatar
            name={child.user.displayName}
            color={child.user.avatarColor}
            emoji={child.user.avatarEmoji}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{child.user.displayName}</p>
            <p className="text-sm text-muted">@{child.user.username}</p>
          </div>
          <ChevronRight size={18} className="text-muted" />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-2xl font-semibold tabular text-ink">
            <Money minor={child.totalMinor} />
          </p>
          <div className="flex flex-wrap justify-end gap-1.5">
            {child.accounts.map((a) => (
              <span
                key={a.id}
                className="rounded-full bg-surface px-2 py-1 text-xs font-medium text-muted"
              >
                {a.name}: <Money minor={a.balanceMinor} />
              </span>
            ))}
          </div>
        </div>
      </Card>
    </Link>
  );
}
