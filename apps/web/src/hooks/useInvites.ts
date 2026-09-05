import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateInviteBody,
  FamilyInvite,
  InvitePreview,
  Me,
  RegisterViaInviteBody,
  RegisterViaInviteResponse,
} from "@botf/shared";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

export function useInvites(enabled = true) {
  return useQuery({
    queryKey: queryKeys.invites(),
    queryFn: () => api.get<FamilyInvite[]>("/families/current/invites"),
    enabled,
  });
}

export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInviteBody) =>
      api.post<FamilyInvite>("/families/current/invites", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.invites() });
    },
  });
}

export function useDeleteInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/families/current/invites/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.invites() });
    },
  });
}

export function useInvitePreview(code: string) {
  return useQuery({
    queryKey: queryKeys.invitePreview(code),
    queryFn: () => api.get<InvitePreview>(`/invites/${code}`),
    retry: false,
    enabled: Boolean(code),
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post<Me>(`/invites/${code}/accept`),
    onSuccess: (me) => {
      qc.setQueryData(queryKeys.me(), me);
    },
  });
}

export function useRegisterViaInvite(code: string) {
  return useMutation({
    mutationFn: (body: RegisterViaInviteBody) =>
      api.post<RegisterViaInviteResponse>(`/invites/${code}/register`, body),
  });
}
