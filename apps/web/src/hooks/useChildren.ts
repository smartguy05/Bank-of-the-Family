import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChildSummary, CreateChildBody, UpdateChildBody, User } from "@botf/shared";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

export function useChildren(enabled = true) {
  return useQuery({
    queryKey: queryKeys.children(),
    queryFn: () => api.get<ChildSummary[]>("/children"),
    enabled,
  });
}

export function useChild(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.child(id ?? ""),
    queryFn: () => api.get<ChildSummary>(`/children/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateChild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateChildBody) => api.post<ChildSummary>("/children", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.children() });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboardParent() });
      void qc.invalidateQueries({ queryKey: queryKeys.accounts() });
    },
  });
}

export function useUpdateChild(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateChildBody) => api.patch<User>(`/children/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.children() });
      void qc.invalidateQueries({ queryKey: queryKeys.child(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboardParent() });
    },
  });
}

export function useResetPin(id: string) {
  return useMutation({
    mutationFn: (pin: string) => api.post<{ ok: true }>(`/children/${id}/pin`, { pin }),
  });
}
