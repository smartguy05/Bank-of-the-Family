import dayjs from "dayjs";
import {
  Banknote,
  Bell,
  Gift,
  Inbox,
  KeyRound,
  PiggyBank,
  Send,
  Target,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Notification } from "@botf/shared";
import { cn } from "@/lib/cn";

const TYPE_ICON: Record<Notification["type"], LucideIcon> = {
  deposit: Wallet,
  charge: Gift,
  withdrawal: Banknote,
  allowance: Wallet,
  interest: PiggyBank,
  transfer: Wallet,
  goal_reached: Target,
  request_submitted: Inbox,
  request_approved: Inbox,
  request_declined: Inbox,
  peer_transfer: Send,
  peer_request_received: Inbox,
  peer_request_approved: Inbox,
  peer_request_declined: Inbox,
  pin_reset: KeyRound,
  system: Bell,
};

export function NotificationRow({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick?: (n: Notification) => void;
}) {
  const Icon = TYPE_ICON[notification.type] ?? Bell;
  const unread = !notification.readAt;

  return (
    <button
      type="button"
      onClick={() => onClick?.(notification)}
      className="flex w-full items-start gap-3 px-1 py-3.5 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded-lg"
    >
      <div className="relative shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-800">
          <Icon size={18} />
        </div>
        {unread && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-negative ring-2 ring-card"
            aria-hidden="true"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm text-ink", unread ? "font-semibold" : "font-medium")}>
          {notification.title}
        </p>
        <p className="text-sm text-muted">{notification.body}</p>
        <p className="mt-0.5 text-xs text-muted">
          {dayjs(notification.createdAt).format("MMM D, h:mm A")}
        </p>
      </div>
    </button>
  );
}
