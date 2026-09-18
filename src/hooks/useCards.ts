import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveCard,
  countCards,
  createCard,
  listCards,
  moveCardToList,
  renameCard,
  updateCardPosition,
  updateCardPositions,
} from "../db/cards";

export function useCards(listId: number) {
  return useQuery({
    queryKey: ["cards", listId],
    queryFn: () => listCards(listId),
  });
}

export function useCardsByListIds(listIds: number[]) {
  return useQueries({
    queries: listIds.map((listId) => ({
      queryKey: ["cards", listId],
      queryFn: () => listCards(listId),
    })),
  });
}

export function useCardCount(listId: number) {
  return useQuery({
    queryKey: ["cardCount", listId],
    queryFn: () => countCards(listId),
  });
}

export function useCreateCard(listId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => createCard(listId, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards", listId] });
      queryClient.invalidateQueries({ queryKey: ["cardCount", listId] });
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards", listId] });
      queryClient.invalidateQueries({ queryKey: ["cardCount", listId] });
    },
  });
}

export function useUpdateCardPosition() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["cards"] });
  return useMutation({
    mutationFn: ({ id, position }: { id: number; position: number }) => updateCardPosition(id, position),
    onSuccess: invalidate,
    // If the write fails, invalidating anyway forces a refetch from SQLite (the source of
    // truth), which snaps the UI back to the last persisted state — no manual rollback needed.
    onError: invalidate,
  });
}

export function useUpdateCardPositions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["cards"] });
  return useMutation({
    mutationFn: (items: { id: number; position: number }[]) => updateCardPositions(items),
    onSuccess: invalidate,
    onError: invalidate,
  });
}

export function useMoveCardToList() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["cards"] });
    queryClient.invalidateQueries({ queryKey: ["cardCount"] });
  };
  return useMutation({
    mutationFn: ({ id, listId, position }: { id: number; listId: number; position: number }) =>
      moveCardToList(id, listId, position),
    onSuccess: invalidate,
    onError: invalidate,
  });
}
