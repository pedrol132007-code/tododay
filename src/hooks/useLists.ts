import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createList, deleteList, listLists, moveList, renameList } from "../db/lists";

export function useLists(boardId: number) {
  return useQuery({
    queryKey: ["lists", boardId],
    queryFn: () => listLists(boardId),
  });
}

export function useCreateList(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createList(boardId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists", boardId] }),
  });
}

export function useRenameList(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameList(id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists", boardId] }),
  });
}

export function useDeleteList(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteList(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists", boardId] }),
  });
}

export function useMoveList(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, direction }: { id: number; direction: "left" | "right" }) =>
      moveList(id, direction),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists", boardId] }),
  });
}
