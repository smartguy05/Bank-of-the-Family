import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateRequestBody, MoneyRequest, RequestStatus } from "@botf/shared";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

type Page = { items: MoneyRequest[]; nextCursor: string | null };

export function useRequests(status?: RequestStatus) {
  return useInfiniteQuery({
    queryKey: queryKeys.requests(status),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", "30");
      if (pageParam) params.set("cursor", pageParam);
      if (status) params.set("status", status);
      return api.get<Page>(`/requests?${params.toString()}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useRequest(id: string | undefined) {
  return useQuery({
    queryKey: ["requests", "one", id ?? ""] as const,
    queryFn: () => api.get<MoneyRequest>(`/requests/${id}`),
    enabled: Boolean(id),
  });
}

function useInvalidateRequests() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["requests"] });
    void qc.invalidateQueries({ queryKey: queryKeys.accounts() });
    void qc.invalidateQueries({ queryKey: queryKeys.children() });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboardParent() });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboardChild() });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  };
}

export function useCreateRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: (body: CreateRequestBody) => api.post<MoneyRequest>("/requests", body),
    onSuccess: invalidate,
  });
}

export function useCancelRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: (id: string) => api.post<MoneyRequest>(`/requests/${id}/cancel`),
    onSuccess: invalidate,
  });
}

export function useApproveRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: ({ id, note = "" }: { id: string; note?: string }) =>
      api.post<MoneyRequest>(`/requests/${id}/approve`, { note }),
    onSuccess: invalidate,
  });
}

export function useDeclineRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: ({ id, note = "" }: { id: string; note?: string }) =>
      api.post<MoneyRequest>(`/requests/${id}/decline`, { note }),
    onSuccess: invalidate,
  });
}
