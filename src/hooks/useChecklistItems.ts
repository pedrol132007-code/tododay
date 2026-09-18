import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createChecklistItem,
  deleteChecklistItem,
  listChecklistItems,
  listChecklistProgressForCards,
  toggleChecklistItem,
} from "../db/checklistItems";

export function useChecklistItems(cardId: number) {
  return useQuery({ queryKey: ["checklistItems", cardId], queryFn: () => listChecklistItems(cardId) });
}

export function useChecklistProgressForCards(cardIds: number[]) {
  return useQuery({
    queryKey: ["checklistProgress", cardIds],
    queryFn: () => listChecklistProgressForCards(cardIds),
  });
}

export function useCreateChecklistItem(cardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => createChecklistItem(cardId, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklistItems", cardId] });
      queryClient.invalidateQueries({ queryKey: ["checklistProgress"] });
    },
  });
}

export function useToggleChecklistItem(cardId: number) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["checklistItems", cardId] });
    queryClient.invalidateQueries({ queryKey: ["checklistProgress"] });
  };
  return useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) => toggleChecklistItem(id, done),
    onSuccess: invalidate,
    onError: invalidate,
  });
}

export function useDeleteChecklistItem(cardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteChecklistItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklistItems", cardId] });
      queryClient.invalidateQueries({ queryKey: ["checklistProgress"] });
    },
  });
}
