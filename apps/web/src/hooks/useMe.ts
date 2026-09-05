import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChangePinBody, ChildLoginBody, LogoutResponse, Me } from "@botf/shared";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => api.get<Me>("/auth/me"),
    retry: false,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<LogoutResponse>("/auth/logout"),
    onSuccess: (res) => {
      qc.clear();
      window.location.assign(res.redirectTo ?? "/login");
    },
  });
}

export function useChildLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ChildLoginBody) => api.post<Me>("/auth/child/login", body),
    onSuccess: (me) => {
      qc.setQueryData(queryKeys.me(), me);
    },
  });
}

export function useChangePin() {
  return useMutation({
    mutationFn: (body: ChangePinBody) => api.post<{ ok: true }>("/auth/child/pin", body),
  });
}

/** Dev-only shortcut sign-in. The API only enables this route outside production. */
export function useDevLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { authentikSub: string; displayName: string }) =>
      api.post<Me>("/auth/dev/login", body),
    onSuccess: (me) => {
      qc.setQueryData(queryKeys.me(), me);
    },
  });
}
