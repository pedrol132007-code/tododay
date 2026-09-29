import { must, supabase } from "./supabase";
import { purgeAttachmentTrash } from "./attachments";
import type { List, ListStatus } from "../types";

export async function listLists(boardId: number): Promise<List[]> {
  return must(await supabase.from("list").select("*").eq("board_id", boardId).order("position"));
}

export async function createList(boardId: number, name: string): Promise<number> {
  const last = must(
    await supabase.from("list").select("position").eq("board_id", boardId).order("position", { ascending: false }).limit(1),
  );
  const position = (last[0]?.position ?? 0) + 1;
  const row = must(await supabase.from("list").insert({ board_id: boardId, name, position }).select("id").single());
  return row.id;
}

export async function renameList(id: number, name: string): Promise<void> {
  must(await supabase.from("list").update({ name }).eq("id", id));
}

/** Tipo da coluna e limite de WIP (null = sem limite), editados no menu da coluna. */
export async function updateListSettings(id: number, settings: { status?: ListStatus; wip_limit?: number | null }): Promise<void> {
  must(await supabase.from("list").update(settings).eq("id", id));
}

export async function deleteList(id: number): Promise<void> {
  must(await supabase.from("list").delete().eq("id", id));
  // Cards arquivados da coluna somem junto, com os anexos.
  void purgeAttachmentTrash();
}

export async function updateListPosition(id: number, position: number): Promise<void> {
  must(await supabase.from("list").update({ position }).eq("id", id));
}

export async function updateListPositions(items: { id: number; position: number }[]): Promise<void> {
  must(await supabase.rpc("set_list_positions", { p_items: items }));
}
