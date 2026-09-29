import { must, supabase } from "./supabase";
import { purgeAttachmentTrash } from "./attachments";
import type { Board } from "../types";

export async function listBoards(teamId: number): Promise<Board[]> {
  return must(await supabase.from("board").select("*").eq("team_id", teamId).order("position"));
}

export async function createBoard(teamId: number, name: string): Promise<number> {
  const last = must(
    await supabase.from("board").select("position").eq("team_id", teamId).order("position", { ascending: false }).limit(1),
  );
  const position = (last[0]?.position ?? 0) + 1;
  const row = must(await supabase.from("board").insert({ team_id: teamId, name, position }).select("id").single());
  return row.id;
}

export async function renameBoard(id: number, name: string): Promise<void> {
  must(await supabase.from("board").update({ name }).eq("id", id));
}

// A RLS só deixa admin excluir; para os outros o delete passa sem apagar nada, então confere.
export async function deleteBoard(id: number): Promise<void> {
  const rows = must(await supabase.from("board").delete().eq("id", id).select("id"));
  if (rows.length === 0) throw new Error("Só admins da equipe podem excluir boards.");
  // Os anexos dos cards foram para a lixeira em cascata: apaga os arquivos.
  void purgeAttachmentTrash();
}

/** O que some junto com o board (por cascade), para o aviso de confirmação. */
export async function boardContents(id: number): Promise<{ lists: number; cards: number }> {
  const [lists, cards] = await Promise.all([
    supabase.from("list").select("*", { count: "exact", head: true }).eq("board_id", id),
    supabase.from("card").select("*", { count: "exact", head: true }).eq("board_id", id),
  ]);
  if (lists.error) throw lists.error;
  if (cards.error) throw cards.error;
  return { lists: lists.count ?? 0, cards: cards.count ?? 0 };
}
