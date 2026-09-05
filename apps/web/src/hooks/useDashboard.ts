import { useQuery } from "@tanstack/react-query";
import type { ChildHome, ParentDashboard } from "@botf/shared";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

export function useParentDashboard(enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboardParent(),
    queryFn: () => api.get<ParentDashboard>("/dashboard/parent"),
    enabled,
  });
}

export function useChildDashboard(enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboardChild(),
    queryFn: () => api.get<ChildHome>("/dashboard/child"),
    enabled,
  });
}
