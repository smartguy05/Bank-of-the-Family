import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Account, CreateAccountBody, UpdateAccountBody } from "@botf/shared";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: () => api.get<Account[]>("/accounts"),
  });
}

export function useAccount(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.account(id ?? ""),
    queryFn: () => api.get<Account>(`/accounts/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAccountBody) => api.post<Account>("/accounts", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts() });
      void qc.invalidateQueries({ queryKey: queryKeys.children() });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboardParent() });
    },
  });
}

export function useUpdateAccount(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateAccountBody) => api.patch<Account>(`/accounts/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts() });
      void qc.invalidateQueries({ queryKey: queryKeys.account(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.children() });
    },
  });
}
