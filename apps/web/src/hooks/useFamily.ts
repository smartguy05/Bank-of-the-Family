import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Me, CreateFamilyBody, Family, UpdateFamilyBody, User } from "@botf/shared";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

export function useFamily(enabled = true) {
  return useQuery({
    queryKey: queryKeys.family(),
    queryFn: () => api.get<Family>("/families/current"),
    enabled,
  });
}

export function useFamilyParents(enabled = true) {
  return useQuery({
    queryKey: queryKeys.familyParents(),
    queryFn: () => api.get<User[]>("/families/current/parents"),
    enabled,
  });
}

export function useCreateFamily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateFamilyBody) => api.post<Family>("/families", body),
    onSuccess: async (family) => {
      qc.setQueryData(queryKeys.family(), family);
      qc.setQueryData<Me>(queryKeys.me(), (old) => (old ? { ...old, family } : old));
      await qc.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}

export function useUpdateFamily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateFamilyBody) => api.patch<Family>("/families/current", body),
    onSuccess: (family) => {
      qc.setQueryData(queryKeys.family(), family);
      void qc.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}
