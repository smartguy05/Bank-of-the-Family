import { useMemo, useState } from "react";
import { Inbox, Send } from "lucide-react";
import type { MoneyRequest } from "@botf/shared";
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
import { useCancelRequest, useRequests } from "@/hooks/useRequests";
import { useAccounts } from "@/hooks/useAccounts";
import { useMe } from "@/hooks/useMe";

function ParentRequests() {
  const [tab, setTab] = useState<"pending" | "history">("pending");
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
      <PageHeader title="Requests" subtitle="Money requests from your kids" />
      <Tabs
        className="mb-2"
        value={tab}
        onChange={(v) => setTab(v as "pending" | "history")}
        items={[
          { value: "pending", label: `Pending${pending.length ? ` (${pending.length})` : ""}` },
          { value: "history", label: "History" },
        ]}
      />
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

      <DecideRequestDialog
        request={decision?.request ?? null}
        action={decision?.action ?? "approve"}
        onClose={() => setDecision(null)}
      />
    </div>
  );
}

function KidRequests() {
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
      <PageHeader
        title="Requests"
        subtitle="Ask a parent for money"
        actions={
          <Button size="sm" icon={<Send size={16} />} onClick={() => setAsking(true)}>
            Ask for money
          </Button>
        }
      />
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

export function RequestsPage() {
  const { data: me } = useMe();
  if (me?.user.role === "parent") return <ParentRequests />;
  return <KidRequests />;
}
