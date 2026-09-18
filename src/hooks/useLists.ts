import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createList,
  deleteList,
  listLists,
  renameList,
  updateListPosition,
  updateListPositions,
} from "../db/lists";

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

export function useUpdateListPosition(boardId: number) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["lists", boardId] });
  return useMutation({
    mutationFn: ({ id, position }: { id: number; position: number }) => updateListPosition(id, position),
    onSuccess: invalidate,
    onError: invalidate,
  });
}

export function useUpdateListPositions(boardId: number) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["lists", boardId] });
  return useMutation({
    mutationFn: (items: { id: number; position: number }[]) => updateListPositions(items),
    onSuccess: invalidate,
    onError: invalidate,
  });
}
