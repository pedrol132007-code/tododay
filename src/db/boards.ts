import { must, supabase } from "./supabase";
import { purgeAttachmentTrash } from "./attachments";
import { defaultListRows } from "../lib/defaultLists";
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
  // Se isto falhar, o board fica sem colunas e o admin cria na mão; o erro aparece no toast.
  must(await supabase.from("list").insert(defaultListRows(row.id)));
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
export async function boardContents(id: number): Promise<{ lists: number; cards: number; attachments: number; attachmentBytes: number }> {
  const [lists, cards, attachments] = await Promise.all([
    supabase.from("list").select("*", { count: "exact", head: true }).eq("board_id", id),
    supabase.from("card").select("*", { count: "exact", head: true }).eq("board_id", id),
    supabase.from("card_attachment").select("size_bytes").eq("board_id", id),
  ]);
  if (lists.error) throw lists.error;
  if (cards.error) throw cards.error;
  if (attachments.error) throw attachments.error;
  return {
    lists: lists.count ?? 0,
    cards: cards.count ?? 0,
    attachments: attachments.data.length,
    attachmentBytes: attachments.data.reduce((n, a) => n + a.size_bytes, 0),
  };
}
