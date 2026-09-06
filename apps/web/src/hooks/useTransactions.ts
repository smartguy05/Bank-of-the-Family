import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChargeBody,
  DepositBody,
  ReverseBody,
  SendMoneyBody,
  Transaction,
  TransactionListQuery,
  TransferBody,
  TransferResult,
} from "@botf/shared";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

type Page = { items: Transaction[]; nextCursor: string | null };

export function useAccountTransactions(
  accountId: string | undefined,
  filters: Partial<Omit<TransactionListQuery, "cursor" | "limit">> = {},
) {
  return useInfiniteQuery({
    queryKey: queryKeys.accountTransactions(accountId ?? "", filters),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", "30");
      if (pageParam) params.set("cursor", pageParam);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.kind) params.set("kind", filters.kind);
      if (filters.category) params.set("category", filters.category);
      return api.get<Page>(`/accounts/${accountId}/transactions?${params.toString()}`);
    },
    enabled: Boolean(accountId),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.transaction(id ?? ""),
    queryFn: () => api.get<Transaction>(`/transactions/${id}`),
    enabled: Boolean(id),
  });
}

function useInvalidateAfterMoneyMove() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.accounts() });
    void qc.invalidateQueries({ queryKey: queryKeys.children() });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboardParent() });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboardChild() });
  };
}

export function useDeposit() {
  const invalidate = useInvalidateAfterMoneyMove();
  return useMutation({
    mutationFn: (body: DepositBody) => api.post<Transaction>("/transactions/deposit", body),
    onSuccess: invalidate,
  });
}

export function useCharge() {
  const invalidate = useInvalidateAfterMoneyMove();
  return useMutation({
    mutationFn: (body: ChargeBody) => api.post<Transaction>("/transactions/charge", body),
    onSuccess: invalidate,
  });
}

export function useTransfer() {
  const invalidate = useInvalidateAfterMoneyMove();
  return useMutation({
    mutationFn: (body: TransferBody) => api.post<TransferResult>("/transactions/transfer", body),
    onSuccess: invalidate,
  });
}

export function useSendMoney() {
  const invalidate = useInvalidateAfterMoneyMove();
  return useMutation({
    mutationFn: (body: SendMoneyBody) => api.post<TransferResult>("/transactions/send", body),
    onSuccess: invalidate,
  });
}

export function useReverse() {
  const invalidate = useInvalidateAfterMoneyMove();
  return useMutation({
    mutationFn: (body: ReverseBody) => api.post<Transaction>("/transactions/reverse", body),
    onSuccess: invalidate,
  });
}
