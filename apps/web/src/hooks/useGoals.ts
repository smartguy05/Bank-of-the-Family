import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AllocateGoalBody, CreateGoalBody, SavingsGoal, UpdateGoalBody } from "@botf/shared";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

/** Omit accountId to fetch every goal visible to the signed-in user. */
export function useGoals(accountId?: string) {
  return useQuery({
    queryKey: queryKeys.goals(accountId),
    queryFn: () => {
      const params = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
      return api.get<SavingsGoal[]>(`/goals${params}`);
    },
  });
}

function useInvalidateGoals() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["goals"] });
    void qc.invalidateQueries({ queryKey: queryKeys.accounts() });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboardParent() });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboardChild() });
  };
}

export function useCreateGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: (body: CreateGoalBody) => api.post<SavingsGoal>("/goals", body),
    onSuccess: invalidate,
  });
}

export function useUpdateGoal(id: string) {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: (body: UpdateGoalBody) => api.patch<SavingsGoal>(`/goals/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: true }>(`/goals/${id}`),
    onSuccess: invalidate,
  });
}

export function useAllocateGoal(id: string) {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: (body: AllocateGoalBody) => api.post<SavingsGoal>(`/goals/${id}/allocate`, body),
    onSuccess: invalidate,
  });
}

export function useCompleteGoal(id: string) {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: () => api.post<SavingsGoal>(`/goals/${id}/complete`),
    onSuccess: invalidate,
  });
}
