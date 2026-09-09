import { useMemo, useState } from "react";
import { Handshake } from "lucide-react";
import type { Iou } from "@botf/shared";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { IouCard } from "@/components/bank/IouCard";
import { RecordIouDialog } from "@/components/bank/RecordIouDialog";
import { PayIouDialog } from "@/components/bank/PayIouDialog";
import { ConfirmDialog } from "@/components/bank/ConfirmDialog";
import {
  useAcceptIou,
  useCancelIou,
  useDeclineIou,
  useDeleteIou,
  useForgiveIou,
  useIous,
} from "@/hooks/useIous";
import { useAccounts } from "@/hooks/useAccounts";
import { useChildren } from "@/hooks/useChildren";
import { useMe } from "@/hooks/useMe";
import type { KidIouGroups, ParentIouGroups } from "@/lib/iou";
import { groupIousForKid, groupIousForParent } from "@/lib/iou";

export function KidIouSection({ meUserId }: { meUserId: string }) {
  const iousQuery = useIous();
  const { data: accounts } = useAccounts();
  const toast = useToast();
  const acceptIou = useAcceptIou();
  const declineIou = useDeclineIou();
  const cancelIou = useCancelIou();

  const [recording, setRecording] = useState(false);
  const [paying, setPaying] = useState<Iou | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const items = useMemo(
    () => iousQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [iousQuery.data],
  );
  const groups = useMemo(() => groupIousForKid(items, meUserId), [items, meUserId]);

  async function handleAccept(iou: Iou) {
    setBusyId(iou.id);
    try {
      await acceptIou.mutateAsync(iou.id);
      toast.success("IOU accepted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not accept the IOU");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(iou: Iou) {
    setBusyId(iou.id);
    try {
      await declineIou.mutateAsync(iou.id);
      toast.info("IOU declined");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not decline the IOU");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(iou: Iou) {
    setBusyId(iou.id);
    try {
      await cancelIou.mutateAsync(iou.id);
      toast.info("IOU cancelled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel the IOU");
    } finally {
      setBusyId(null);
    }
  }

  const sections: Array<{ key: keyof KidIouGroups; heading: string }> = [
    { key: "needsOk", heading: "Needs your OK" },
    { key: "youOwe", heading: "You owe" },
    { key: "owedToYou", heading: "Owed to you" },
    { key: "betweenSiblings", heading: "Between your siblings" },
    { key: "history", heading: "History" },
  ];

  const isEmpty = items.length === 0;

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" icon={<Handshake size={16} />} onClick={() => setRecording(true)}>
          Record an IOU
        </Button>
      </div>
      <Card>
        <CardBody className="px-4 py-1">
          {iousQuery.isLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : isEmpty ? (
            <EmptyState
              icon={<Handshake size={28} />}
              title="No IOUs yet"
              description="Keep track of what you and your siblings owe each other."
            />
          ) : (
            sections.map(({ key, heading }) => {
              const list = groups[key];
              if (list.length === 0) return null;
              return (
                <div key={key}>
                  <h3 className="px-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                    {heading}
                  </h3>
                  <div className="divide-y divide-line">
                    {list.map((iou) => (
                      <IouCard
                        key={iou.id}
                        iou={iou}
                        meUserId={meUserId}
                        role="child"
                        busy={busyId === iou.id}
                        onAccept={(i) => void handleAccept(i)}
                        onDecline={(i) => void handleDecline(i)}
                        onCancel={(i) => void handleCancel(i)}
                        onPay={(i) => setPaying(i)}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
          {iousQuery.hasNextPage && (
            <div className="flex justify-center py-3">
              <Button
                variant="secondary"
                size="sm"
                loading={iousQuery.isFetchingNextPage}
                onClick={() => void iousQuery.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <RecordIouDialog
        open={recording}
        onClose={() => setRecording(false)}
        mode="kid"
        meUserId={meUserId}
      />
      <PayIouDialog iou={paying} accounts={accounts ?? []} onClose={() => setPaying(null)} />
    </div>
  );
}

export function ParentIouSection({ filterChildId }: { filterChildId?: string } = {}) {
  const { data: me } = useMe();
  const meUserId = me?.user.id ?? "";
  const iousQuery = useIous();
  const { data: children } = useChildren();
  const toast = useToast();
  const cancelIou = useCancelIou();
  const forgiveIou = useForgiveIou();
  const deleteIou = useDeleteIou();

  const [recording, setRecording] = useState(false);
  const [paying, setPaying] = useState<Iou | null>(null);
  const [deleting, setDeleting] = useState<Iou | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const allItems = useMemo(
    () => iousQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [iousQuery.data],
  );
  const items = useMemo(
    () =>
      filterChildId
        ? allItems.filter(
            (i) => i.debtorUserId === filterChildId || i.creditorUserId === filterChildId,
          )
        : allItems,
    [allItems, filterChildId],
  );
  const groups = useMemo(() => groupIousForParent(items), [items]);

  const payAccounts = paying
    ? ((children ?? []).find((c) => c.user.id === paying.debtorUserId)?.accounts ?? [])
    : [];

  async function handleCancel(iou: Iou) {
    setBusyId(iou.id);
    try {
      await cancelIou.mutateAsync(iou.id);
      toast.info("IOU cancelled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel the IOU");
    } finally {
      setBusyId(null);
    }
  }

  async function handleForgive(iou: Iou) {
    setBusyId(iou.id);
    try {
      await forgiveIou.mutateAsync(iou.id);
      toast.success("IOU forgiven");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not forgive the IOU");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await deleteIou.mutateAsync(deleting.id);
      toast.info("IOU deleted");
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the IOU");
    } finally {
      setBusyId(null);
    }
  }

  const sections: Array<{ key: keyof ParentIouGroups; heading: string }> = [
    { key: "active", heading: "Active" },
    { key: "history", heading: "History" },
  ];

  const isEmpty = items.length === 0;

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" icon={<Handshake size={16} />} onClick={() => setRecording(true)}>
          Record an IOU
        </Button>
      </div>
      <Card>
        <CardBody className="px-4 py-1">
          {iousQuery.isLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : isEmpty ? (
            <EmptyState
              icon={<Handshake size={28} />}
              title="No IOUs yet"
              description="Record what one kid owes another and they can pay it off from their account."
            />
          ) : (
            sections.map(({ key, heading }) => {
              const list = groups[key];
              if (list.length === 0) return null;
              return (
                <div key={key}>
                  <h3 className="px-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                    {heading}
                  </h3>
                  <div className="divide-y divide-line">
                    {list.map((iou) => (
                      <IouCard
                        key={iou.id}
                        iou={iou}
                        meUserId={meUserId}
                        role="parent"
                        busy={busyId === iou.id}
                        onCancel={(i) => void handleCancel(i)}
                        onForgive={(i) => void handleForgive(i)}
                        onPay={(i) => setPaying(i)}
                        onDelete={(i) => setDeleting(i)}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
          {iousQuery.hasNextPage && (
            <div className="flex justify-center py-3">
              <Button
                variant="secondary"
                size="sm"
                loading={iousQuery.isFetchingNextPage}
                onClick={() => void iousQuery.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <RecordIouDialog open={recording} onClose={() => setRecording(false)} mode="parent" />
      <PayIouDialog iou={paying} accounts={payAccounts} onClose={() => setPaying(null)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this IOU?"
        description="This removes it for everyone. Nothing has been paid on it."
        confirmLabel="Delete"
        danger
        loading={Boolean(deleting) && busyId === deleting?.id}
        onConfirm={() => void handleDeleteConfirm()}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
