import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { boardContents, createBoard, deleteBoard, listBoards, renameBoard } from "../db/boards";

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

export function useRenameBoard(teamId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameBoard(id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["boards", teamId] }),
  });
}

export function useDeleteBoard(teamId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteBoard(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["boards", teamId] }),
  });
}

export function useBoardContents(boardId: number) {
  return useQuery({
    queryKey: ["boardContents", boardId],
    queryFn: () => boardContents(boardId),
    staleTime: 0,
  });
}
