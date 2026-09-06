import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ApprovePeerRequestBody,
  CreatePeerRequestBody,
  PeerRequest,
  PeerSummary,
  RequestStatus,
} from "@botf/shared";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

type Page = { items: PeerRequest[]; nextCursor: string | null };

export function usePeers() {
  return useQuery({
    queryKey: queryKeys.peers(),
    queryFn: () => api.get<PeerSummary[]>("/families/current/peers"),
  });
}

export function usePeerRequests(status?: RequestStatus) {
  return useInfiniteQuery({
    queryKey: queryKeys.peerRequests(status),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", "30");
      if (pageParam) params.set("cursor", pageParam);
      if (status) params.set("status", status);
      return api.get<Page>(`/peer-requests?${params.toString()}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

function useInvalidatePeerRequests() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["peerRequests"] });
    void qc.invalidateQueries({ queryKey: queryKeys.accounts() });
    void qc.invalidateQueries({ queryKey: queryKeys.children() });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboardParent() });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboardChild() });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  };
}

export function useCreatePeerRequest() {
  const invalidate = useInvalidatePeerRequests();
  return useMutation({
    mutationFn: (body: CreatePeerRequestBody) => api.post<PeerRequest>("/peer-requests", body),
    onSuccess: invalidate,
  });
}

export function useCancelPeerRequest() {
  const invalidate = useInvalidatePeerRequests();
  return useMutation({
    mutationFn: (id: string) => api.post<PeerRequest>(`/peer-requests/${id}/cancel`),
    onSuccess: invalidate,
  });
}

export function useApprovePeerRequest() {
  const invalidate = useInvalidatePeerRequests();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & ApprovePeerRequestBody) =>
      api.post<PeerRequest>(`/peer-requests/${id}/approve`, body),
    onSuccess: invalidate,
  });
}

export function useDeclinePeerRequest() {
  const invalidate = useInvalidatePeerRequests();
  return useMutation({
    mutationFn: ({ id, note = "" }: { id: string; note?: string }) =>
      api.post<PeerRequest>(`/peer-requests/${id}/decline`, { note }),
    onSuccess: invalidate,
  });
}
