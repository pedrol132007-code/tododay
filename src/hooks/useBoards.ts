import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBoard, listBoards } from "../db/boards";

export function useBoards() {
  return useQuery({
    queryKey: ["boards"],
    queryFn: listBoards,
  });
}

export function useCreateBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createBoard(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["boards"] }),
  });
}
