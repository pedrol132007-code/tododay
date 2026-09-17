import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { archiveCard, createCard, listCards, moveCard, renameCard } from "../db/cards";

export function useCards(listId: number) {
  return useQuery({
    queryKey: ["cards", listId],
    queryFn: () => listCards(listId),
  });
}

export function useCreateCard(listId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => createCard(listId, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", listId] }),
  });
}

export function useRenameCard(listId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) => renameCard(id, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", listId] }),
  });
}

export function useArchiveCard(listId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => archiveCard(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", listId] }),
  });
}

export function useMoveCard(listId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, direction }: { id: number; direction: "up" | "down" }) =>
      moveCard(id, direction),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", listId] }),
  });
}
