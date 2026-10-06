import { useQuery } from "@tanstack/react-query";
import { listMyTasks } from "../db/myTasks";

/** Recarrega ao abrir a tela; não assina o Realtime de todos os boards. */
export function useMyTasks(teamId: number, userId: string) {
  return useQuery({ queryKey: ["myTasks", teamId, userId], queryFn: () => listMyTasks(teamId, userId), refetchOnMount: "always" });
}
