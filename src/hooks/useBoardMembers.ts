import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addBoardMember, listBoardMemberIds, removeBoardMember } from "../db/boardMembers";
import type { TeamMember } from "../types";

export function useBoardMemberIds(boardId: number) {
  return useQuery({
    queryKey: ["boardMembers", boardId],
    queryFn: () => listBoardMemberIds(boardId),
  });
}

export function useSetBoardMember(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, member }: { userId: string; member: boolean }) =>
      member ? addBoardMember(boardId, userId) : removeBoardMember(boardId, userId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["boardMembers", boardId] });
      // Tirar alguém desatribui os cards dele no board.
      void queryClient.invalidateQueries({ queryKey: ["cards"] });
    },
  });
}

/** Só o líder vê todos os boards (0021); os outros, admin inclusive, só os boards em que estão. */
export function seesAllBoards(member: Pick<TeamMember, "is_leader">): boolean {
  return member.is_leader;
}
