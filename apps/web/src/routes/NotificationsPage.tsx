import { useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import type { Notification } from "@botf/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { NotificationRow } from "@/components/bank/NotificationRow";
import { PushCard } from "@/components/bank/PushCard";
import {
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
} from "@/hooks/useNotifications";

export function NotificationsPage() {
  const notificationsQuery = useNotifications();
  const { data: unread } = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const navigate = useNavigate();

  const items = notificationsQuery.data?.pages.flatMap((p) => p.items) ?? [];

  async function handleClick(n: Notification) {
    if (!n.readAt) void markRead.mutateAsync(n.id);
    const data = n.data as {
      accountId?: string;
      requestId?: string;
      peerRequestId?: string;
      iouId?: string;
    };
    if (data.requestId || data.peerRequestId || data.iouId) {
      void navigate({ to: "/requests" });
    } else if (data.accountId) {
      void navigate({ to: "/accounts/$accountId", params: { accountId: data.accountId } });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Notifications"
        subtitle="Everything that's happened, in one place"
        actions={
          Boolean(unread?.unread) && (
            <Button
              size="sm"
              variant="secondary"
              icon={<CheckCheck size={16} />}
              loading={markAllRead.isPending}
              onClick={() => void markAllRead.mutateAsync()}
            >
              Mark all read
            </Button>
          )
        }
      />

      <PushCard />

      <Card>
        <CardBody className="px-3 py-1">
          {notificationsQuery.isLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Bell size={28} />}
              title="Nothing here yet"
              description="Deposits, charges, allowance, and requests will show up here as they happen."
            />
          ) : (
            <div className="divide-y divide-line">
              {items.map((n) => (
                <NotificationRow key={n.id} notification={n} onClick={() => void handleClick(n)} />
              ))}
            </div>
          )}
          {notificationsQuery.hasNextPage && (
            <div className="flex justify-center py-3">
              <Button
                variant="secondary"
                size="sm"
                loading={notificationsQuery.isFetchingNextPage}
                onClick={() => void notificationsQuery.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
