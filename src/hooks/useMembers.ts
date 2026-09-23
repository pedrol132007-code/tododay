import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMember,
  deleteMember,
  getMemberRequestStats,
  getMembers,
  getStatusSummaryByBoard,
  updateMember,
  type MemberPatch,
} from "../db/members";

export function useMembers() {
  return useQuery({ queryKey: ["members"], queryFn: getMembers });
}

// Summary queries are only mounted while the Team view is open; the default staleTime of 0
// refetches them every time it opens, so card mutations elsewhere don't need to invalidate them.
export function useStatusSummary() {
  return useQuery({ queryKey: ["statusSummary"], queryFn: getStatusSummaryByBoard });
}

export function useMemberRequestStats() {
  return useQuery({ queryKey: ["memberRequestStats"], queryFn: getMemberRequestStats });
}

export function useCreateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) => createMember(name, color),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
  });
}

export function useUpdateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: MemberPatch }) => updateMember(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
  });
}

export function useDeleteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteMember(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      queryClient.invalidateQueries({ queryKey: ["memberRequestStats"] });
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      queryClient.invalidateQueries({ queryKey: ["archivedCards"] });
    },
  });
}
