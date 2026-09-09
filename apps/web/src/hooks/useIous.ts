import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateIouBody, Iou, IouStatus, PayIouBody } from "@botf/shared";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

type Page = { items: Iou[]; nextCursor: string | null };

export function useIous(status?: IouStatus) {
  return useInfiniteQuery({
    queryKey: queryKeys.ious(status),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", "30");
      if (pageParam) params.set("cursor", pageParam);
      if (status) params.set("status", status);
      return api.get<Page>(`/ious?${params.toString()}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useIou(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.iou(id ?? ""),
    queryFn: () => api.get<Iou>(`/ious/${id}`),
    enabled: Boolean(id),
  });
}

function useInvalidateIous() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["ious"] });
    void qc.invalidateQueries({ queryKey: queryKeys.accounts() });
    void qc.invalidateQueries({ queryKey: queryKeys.children() });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboardParent() });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboardChild() });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  };
}

export function useCreateIou() {
  const invalidate = useInvalidateIous();
  return useMutation({
    mutationFn: (body: CreateIouBody) => api.post<Iou>("/ious", body),
    onSuccess: invalidate,
  });
}

export function useAcceptIou() {
  const invalidate = useInvalidateIous();
  return useMutation({
    mutationFn: (id: string) => api.post<Iou>(`/ious/${id}/accept`),
    onSuccess: invalidate,
  });
}

export function useDeclineIou() {
  const invalidate = useInvalidateIous();
  return useMutation({
    mutationFn: (id: string) => api.post<Iou>(`/ious/${id}/decline`),
    onSuccess: invalidate,
  });
}

export function useCancelIou() {
  const invalidate = useInvalidateIous();
  return useMutation({
    mutationFn: (id: string) => api.post<Iou>(`/ious/${id}/cancel`),
    onSuccess: invalidate,
  });
}

export function useForgiveIou() {
  const invalidate = useInvalidateIous();
  return useMutation({
    mutationFn: (id: string) => api.post<Iou>(`/ious/${id}/forgive`),
    onSuccess: invalidate,
  });
}

export function useDeleteIou() {
  const invalidate = useInvalidateIous();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: true }>(`/ious/${id}`),
    onSuccess: invalidate,
  });
}

export function usePayIou() {
  const invalidate = useInvalidateIous();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & PayIouBody) =>
      api.post<Iou>(`/ious/${id}/pay`, body),
    onSuccess: invalidate,
  });
}
