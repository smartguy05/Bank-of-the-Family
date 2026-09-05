import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AllowanceSchedule, CreateAllowanceBody, UpdateAllowanceBody } from "@botf/shared";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

/** Omit accountId to fetch every allowance schedule in the family. */
export function useAllowances(accountId?: string) {
  return useQuery({
    queryKey: queryKeys.allowances(accountId),
    queryFn: () => {
      const params = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
      return api.get<AllowanceSchedule[]>(`/allowances${params}`);
    },
  });
}

function useInvalidateAllowances() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["allowances"] });
    void qc.invalidateQueries({ queryKey: queryKeys.accounts() });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboardParent() });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboardChild() });
  };
}

export function useCreateAllowance() {
  const invalidate = useInvalidateAllowances();
  return useMutation({
    mutationFn: (body: CreateAllowanceBody) => api.post<AllowanceSchedule>("/allowances", body),
    onSuccess: invalidate,
  });
}

export function useUpdateAllowance(id: string) {
  const invalidate = useInvalidateAllowances();
  return useMutation({
    mutationFn: (body: UpdateAllowanceBody) =>
      api.patch<AllowanceSchedule>(`/allowances/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteAllowance() {
  const invalidate = useInvalidateAllowances();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: true }>(`/allowances/${id}`),
    onSuccess: invalidate,
  });
}
