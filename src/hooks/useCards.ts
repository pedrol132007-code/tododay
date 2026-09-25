import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveCard,
  countCards,
  createCard,
  deleteCardPermanently,
  listArchivedCards,
  listCards,
  moveCardToList,
  renameCard,
  restoreCard,
  updateCardAssignee,
  updateCardDescription,
  updateCardDueDate,
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

export function useUpdateCardDescription(listId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, description }: { id: number; description: string }) =>
      updateCardDescription(id, description),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", listId] }),
  });
}

export function useUpdateCardDueDate(listId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dueDate }: { id: number; dueDate: string | null }) =>
      updateCardDueDate(id, dueDate),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", listId] }),
  });
}

export function useUpdateCardAssignee(listId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, assigneeId }: { id: number; assigneeId: string | null }) => updateCardAssignee(id, assigneeId),
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
    // If the write fails, invalidating anyway forces a refetch from the database (the source of
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

export function useArchivedCards(boardId: number) {
  return useQuery({ queryKey: ["archivedCards", boardId], queryFn: () => listArchivedCards(boardId) });
}

export function useRestoreCard(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => restoreCard(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["archivedCards", boardId] });
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      queryClient.invalidateQueries({ queryKey: ["cardCount"] });
    },
  });
}

export function useDeleteCardPermanently(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteCardPermanently(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["archivedCards", boardId] }),
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
