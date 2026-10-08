import { must, supabase } from "./supabase";

/** Quem participa do board (0020). Admin e líder veem todos os boards sem estar aqui. */
export async function listBoardMemberIds(boardId: number): Promise<string[]> {
  const rows = must(await supabase.from("board_member").select("user_id").eq("board_id", boardId));
  return rows.map((r) => r.user_id);
}

export async function addBoardMember(boardId: number, userId: string): Promise<void> {
  must(await supabase.from("board_member").insert({ board_id: boardId, user_id: userId }));
}

/** Os cards da pessoa neste board ficam sem responsável (trigger board_member_unassign). */
export async function removeBoardMember(boardId: number, userId: string): Promise<void> {
  must(await supabase.from("board_member").delete().eq("board_id", boardId).eq("user_id", userId));
}
