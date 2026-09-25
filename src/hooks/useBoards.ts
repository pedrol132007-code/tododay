import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBoard, listBoards } from "../db/boards";

export function useBoards(teamId: number) {
  return useQuery({
    queryKey: ["boards", teamId],
    queryFn: () => listBoards(teamId),
  });
}

export function useCreateBoard(teamId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createBoard(teamId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["boards", teamId] }),
  });
}
