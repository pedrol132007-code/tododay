import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createLabel,
  deleteLabel,
  listCardLabels,
  listLabels,
  listLabelsForCards,
  setCardLabel,
} from "../db/labels";

export function useLabels(boardId: number) {
  return useQuery({ queryKey: ["labels", boardId], queryFn: () => listLabels(boardId) });
}

export function useCardLabels(cardId: number) {
  return useQuery({ queryKey: ["cardLabels", cardId], queryFn: () => listCardLabels(cardId) });
}

export function useLabelsForCards(cardIds: number[]) {
  return useQuery({
    queryKey: ["labelsForCards", cardIds],
    queryFn: () => listLabelsForCards(cardIds),
  });
}

export function useCreateLabel(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) => createLabel(boardId, name, color),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["labels", boardId] }),
  });
}

export function useDeleteLabel(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteLabel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["labels", boardId] });
      queryClient.invalidateQueries({ queryKey: ["cardLabels"] });
      queryClient.invalidateQueries({ queryKey: ["labelsForCards"] });
    },
  });
}

export function useSetCardLabel(cardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ labelId, on }: { labelId: number; on: boolean }) => setCardLabel(cardId, labelId, on),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cardLabels", cardId] });
      queryClient.invalidateQueries({ queryKey: ["labelsForCards"] });
    },
  });
}
