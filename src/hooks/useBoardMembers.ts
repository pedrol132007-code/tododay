import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addBoardMember, listBoardMemberIds, removeBoardMember } from "../db/boardMembers";
import { useTeamMembers } from "./useTeams";
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

/** Admin e líder veem todos os boards; os outros, só os boards em que estão. */
export function seesAllBoards(member: Pick<TeamMember, "role" | "is_leader">): boolean {
  return member.role === "admin" || member.is_leader;
}

/** Quem pode ser responsável por um card deste board: quem vê o board e está ativo. */
export function useBoardPeople(teamId: number, boardId: number) {
  const { data: members } = useTeamMembers(teamId);
  const { data: ids } = useBoardMemberIds(boardId);
  if (!members || !ids) return undefined;
  return members.filter((m) => seesAllBoards(m) || ids.includes(m.user_id));
}
