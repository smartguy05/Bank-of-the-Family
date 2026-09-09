import { useMemo, useState } from "react";
import { Inbox, Send } from "lucide-react";
import type { MoneyRequest, PeerRequest } from "@botf/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { RequestCard } from "@/components/bank/RequestCard";
import { AskForMoneyDialog } from "@/components/bank/AskForMoneyDialog";
import { DecideRequestDialog } from "@/components/bank/DecideRequestDialog";
import { PeerRequestCard } from "@/components/bank/PeerRequestCard";
import { SendMoneyDialog } from "@/components/bank/SendMoneyDialog";
import { RequestFromSiblingDialog } from "@/components/bank/RequestFromSiblingDialog";
import { DecidePeerRequestDialog } from "@/components/bank/DecidePeerRequestDialog";
import { ConfirmDialog } from "@/components/bank/ConfirmDialog";
import { KidIouSection, ParentIouSection } from "@/components/bank/IouSections";
import { useCancelRequest, useRequests } from "@/hooks/useRequests";
import {
  useCancelPeerRequest,
  useDeletePeerRequest,
  usePeerRequests,
} from "@/hooks/usePeerRequests";
import { useAccounts } from "@/hooks/useAccounts";
import { useMe } from "@/hooks/useMe";

function ParentFamilyRequests() {
  const { data: me } = useMe();
  const requestsQuery = usePeerRequests();
  const deletePeerRequest = useDeletePeerRequest();
  const toast = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<PeerRequest | null>(null);

  const items = useMemo(
    () => requestsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [requestsQuery.data],
  );

  async function handleDeleteConfirm() {
    if (!confirmTarget) return;
    setDeletingId(confirmTarget.id);
    try {
      await deletePeerRequest.mutateAsync(confirmTarget.id);
      toast.info("Request deleted");
      setConfirmTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete request");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <Card>
        <CardBody className="px-4 py-1">
          {requestsQuery.isLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Inbox size={28} />}
              title="No sibling requests"
              description="Requests your kids send each other will show up here."
            />
          ) : (
            <div className="divide-y divide-line">
              {items.map((r) => (
                <PeerRequestCard
                  key={r.id}
                  request={r}
                  meUserId={me?.user.id ?? ""}
                  onDelete={(req) => setConfirmTarget(req)}
                  deleting={deletingId === r.id}
                />
              ))}
            </div>
          )}
          {requestsQuery.hasNextPage && (
            <div className="flex justify-center py-3">
              <Button
                variant="secondary"
                size="sm"
                loading={requestsQuery.isFetchingNextPage}
                onClick={() => void requestsQuery.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title="Delete this request?"
        description="This removes it for everyone."
        confirmLabel="Delete"
        danger
        loading={Boolean(confirmTarget) && deletingId === confirmTarget?.id}
        onConfirm={() => void handleDeleteConfirm()}
        onClose={() => setConfirmTarget(null)}
      />
    </div>
  );
}

function ParentRequests() {
  const [tab, setTab] = useState<"pending" | "history" | "family" | "ious">("pending");
  const pendingQuery = useRequests("pending");
  const historyQuery = useRequests();
  const [decision, setDecision] = useState<{
    request: MoneyRequest;
    action: "approve" | "decline";
  } | null>(null);

  const pending = pendingQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const history = (historyQuery.data?.pages.flatMap((p) => p.items) ?? []).filter(
    (r) => r.status !== "pending",
  );

  const query = tab === "pending" ? pendingQuery : historyQuery;
  const items = tab === "pending" ? pending : history;

  return (
    <div>
      <PageHeader title="Requests" subtitle="Money requests, sibling requests and IOUs" />
      <Tabs
        className="mb-2"
        value={tab}
        onChange={(v) => setTab(v as "pending" | "history" | "family" | "ious")}
        items={[
          { value: "pending", label: `Pending${pending.length ? ` (${pending.length})` : ""}` },
          { value: "history", label: "History" },
          { value: "family", label: "Family" },
          { value: "ious", label: "IOUs" },
        ]}
      />
      {tab === "pending" || tab === "history" ? (
        <Card>
          <CardBody className="px-4 py-1">
            {query.isLoading ? (
              <div className="space-y-3 py-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={<Inbox size={28} />}
                title={tab === "pending" ? "Nothing pending" : "No history yet"}
                description={
                  tab === "pending"
                    ? "Requests from your kids will show up here."
                    : "Decided requests will show up here."
                }
              />
            ) : (
              <div className="divide-y divide-line">
                {items.map((r) => (
                  <RequestCard
                    key={r.id}
                    request={r}
                    onApprove={(req) => setDecision({ request: req, action: "approve" })}
                    onDecline={(req) => setDecision({ request: req, action: "decline" })}
                  />
                ))}
              </div>
            )}
            {query.hasNextPage && (
              <div className="flex justify-center py-3">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                >
                  Load more
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      ) : tab === "family" ? (
        <ParentFamilyRequests />
      ) : (
        <ParentIouSection />
      )}

      <DecideRequestDialog
        request={decision?.request ?? null}
        action={decision?.action ?? "approve"}
        onClose={() => setDecision(null)}
      />
    </div>
  );
}

function ParentAskRequests() {
  const { data: accounts } = useAccounts();
  const requestsQuery = useRequests();
  const cancelRequest = useCancelRequest();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const items = useMemo(
    () => requestsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [requestsQuery.data],
  );

  async function handleCancel(request: MoneyRequest) {
    setCancellingId(request.id);
    try {
      await cancelRequest.mutateAsync(request.id);
      toast.info("Request cancelled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel request");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" icon={<Send size={16} />} onClick={() => setAsking(true)}>
          Ask for money
        </Button>
      </div>
      <Card>
        <CardBody className="px-4 py-1">
          {requestsQuery.isLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Inbox size={28} />}
              title="No requests yet"
              description="Need some money for something? Ask a parent."
              action={<Button onClick={() => setAsking(true)}>Ask for money</Button>}
            />
          ) : (
            <div className="divide-y divide-line">
              {items.map((r) => (
                <RequestCard
                  key={r.id}
                  request={r}
                  onCancel={(req) => void handleCancel(req)}
                  cancelling={cancellingId === r.id}
                />
              ))}
            </div>
          )}
          {requestsQuery.hasNextPage && (
            <div className="flex justify-center py-3">
              <Button
                variant="secondary"
                size="sm"
                loading={requestsQuery.isFetchingNextPage}
                onClick={() => void requestsQuery.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <AskForMoneyDialog open={asking} onClose={() => setAsking(false)} accounts={accounts ?? []} />
    </div>
  );
}

function FamilyRequests() {
  const { data: me } = useMe();
  const { data: accounts } = useAccounts();
  const requestsQuery = usePeerRequests();
  const cancelPeerRequest = useCancelPeerRequest();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [asking, setAsking] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [decision, setDecision] = useState<{
    request: PeerRequest;
    action: "approve" | "decline";
  } | null>(null);

  const items = useMemo(
    () => requestsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [requestsQuery.data],
  );

  async function handleCancel(request: PeerRequest) {
    setCancellingId(request.id);
    try {
      await cancelPeerRequest.mutateAsync(request.id);
      toast.info("Request cancelled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel request");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={() => setAsking(true)}>
          Request from a sibling
        </Button>
        <Button size="sm" icon={<Send size={16} />} onClick={() => setSending(true)}>
          Send money
        </Button>
      </div>
      <Card>
        <CardBody className="px-4 py-1">
          {requestsQuery.isLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Inbox size={28} />}
              title="No sibling requests yet"
              description="Send money to a sibling or ask them for some."
            />
          ) : (
            <div className="divide-y divide-line">
              {items.map((r) => (
                <PeerRequestCard
                  key={r.id}
                  request={r}
                  meUserId={me?.user.id ?? ""}
                  onApprove={(req) => setDecision({ request: req, action: "approve" })}
                  onDecline={(req) => setDecision({ request: req, action: "decline" })}
                  onCancel={(req) => void handleCancel(req)}
                  cancelling={cancellingId === r.id}
                />
              ))}
            </div>
          )}
          {requestsQuery.hasNextPage && (
            <div className="flex justify-center py-3">
              <Button
                variant="secondary"
                size="sm"
                loading={requestsQuery.isFetchingNextPage}
                onClick={() => void requestsQuery.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <SendMoneyDialog open={sending} onClose={() => setSending(false)} accounts={accounts ?? []} />
      <RequestFromSiblingDialog
        open={asking}
        onClose={() => setAsking(false)}
        accounts={accounts ?? []}
      />
      <DecidePeerRequestDialog
        request={decision?.request ?? null}
        action={decision?.action ?? "approve"}
        accounts={accounts ?? []}
        onClose={() => setDecision(null)}
      />
    </div>
  );
}

function KidRequests() {
  const { data: me } = useMe();
  const [tab, setTab] = useState<"parent" | "family" | "ious">("parent");

  return (
    <div>
      <PageHeader title="Requests" subtitle="Ask a parent, settle up with siblings, track IOUs" />
      <Tabs
        className="mb-2"
        value={tab}
        onChange={(v) => setTab(v as "parent" | "family" | "ious")}
        items={[
          { value: "parent", label: "Parent" },
          { value: "family", label: "Family" },
          { value: "ious", label: "IOUs" },
        ]}
      />
      {tab === "parent" ? (
        <ParentAskRequests />
      ) : tab === "family" ? (
        <FamilyRequests />
      ) : (
        <KidIouSection meUserId={me?.user.id ?? ""} />
      )}
    </div>
  );
}

export function RequestsPage() {
  const { data: me } = useMe();
  if (me?.user.role === "parent") return <ParentRequests />;
  return <KidRequests />;
}
