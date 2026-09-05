import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";

export function Header({ familyName, unread }: { familyName?: string; unread?: number }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-line bg-card px-4 sm:hidden">
      <div>
        <p className="text-sm font-semibold text-brand-900">Bank of the Family</p>
        {familyName && <p className="text-xs text-muted leading-tight">{familyName}</p>}
      </div>
      <Link
        to="/notifications"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative rounded-full p-2 text-muted hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        <Bell size={20} />
        {Boolean(unread) && (
          <span
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-negative"
            aria-hidden="true"
          />
        )}
      </Link>
    </header>
  );
}
