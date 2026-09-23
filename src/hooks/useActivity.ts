import { useQuery } from "@tanstack/react-query";
import { listCardActivity, listTeamActivity } from "../db/activity";

export function useCardActivity(cardId: number) {
  return useQuery({ queryKey: ["activity", "card", cardId], queryFn: () => listCardActivity(cardId) });
}

export function useTeamActivity(teamId: number) {
  return useQuery({ queryKey: ["activity", "team", teamId], queryFn: () => listTeamActivity(teamId) });
}
