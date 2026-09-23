import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTeam, listMyTeams } from "../db/teams";

export function useMyTeams(userId: string) {
  return useQuery({
    queryKey: ["teams", userId],
    queryFn: () => listMyTeams(userId),
  });
}

export function useCreateTeam(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createTeam(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams", userId] }),
  });
}
