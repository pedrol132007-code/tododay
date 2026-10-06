import { must, supabase } from "./supabase";
import type { CardPriority } from "../types";

export type MyTask = {
  id: number;
  title: string;
  due_date: string | null;
  priority: CardPriority | null;
  board_id: number;
  board: { name: string };
  list: { name: string };
};

/** Cards abertos atribuídos à pessoa, em todos os boards da equipe (sem arquivados e sem coluna "done"). */
export async function listMyTasks(teamId: number, userId: string): Promise<MyTask[]> {
  return must(
    await supabase
      .from("card")
      .select("id, title, due_date, priority, board_id, board!inner(name, team_id), list!inner(name, status)")
      .eq("assignee_id", userId)
      .is("archived_at", null)
      .eq("board.team_id", teamId)
      .neq("list.status", "done"),
  ) as unknown as MyTask[];
}
