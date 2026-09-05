import { useQuery } from "@tanstack/react-query";
import type { Statement } from "@botf/shared";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

export function useStatementPeriods(accountId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.statementPeriods(accountId ?? ""),
    queryFn: () => api.get<{ periods: string[] }>(`/accounts/${accountId}/statements`),
    enabled: Boolean(accountId),
  });
}

export function useStatement(accountId: string | undefined, period: string | undefined) {
  return useQuery({
    queryKey: queryKeys.statement(accountId ?? "", period ?? ""),
    queryFn: () => api.get<Statement>(`/accounts/${accountId}/statements/${period}`),
    enabled: Boolean(accountId) && Boolean(period),
  });
}

/** Same-origin GET; the cookie session covers it, so a plain navigation triggers the download. */
export function statementCsvUrl(accountId: string, period: string): string {
  return `/api/accounts/${accountId}/statements/${period}/csv`;
}
