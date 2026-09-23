import { must, supabase } from "./supabase";
import type { Card } from "../types";

// updated_at é mantido por trigger no Postgres (0004), não pelo app.

export async function listCards(listId: number): Promise<Card[]> {
  return must(
    await supabase.from("card").select("*").eq("list_id", listId).is("archived_at", null).order("position"),
  );
}

export async function createCard(listId: number, title: string): Promise<number> {
  const last = must(
    await supabase.from("card").select("position").eq("list_id", listId).order("position", { ascending: false }).limit(1),
  );
  const position = (last[0]?.position ?? 0) + 1;
  // board_id é preenchido pelo trigger a partir de list_id.
  const row = must(await supabase.from("card").insert({ list_id: listId, title, position }).select("id").single());
  return row.id;
}

export async function renameCard(id: number, title: string): Promise<void> {
  must(await supabase.from("card").update({ title }).eq("id", id));
}

export async function updateCardDescription(id: number, description: string): Promise<void> {
  must(await supabase.from("card").update({ description }).eq("id", id));
}

export async function updateCardDueDate(id: number, dueDate: string | null): Promise<void> {
  must(await supabase.from("card").update({ due_date: dueDate }).eq("id", id));
}

export async function archiveCard(id: number): Promise<void> {
  must(await supabase.from("card").update({ archived_at: new Date().toISOString() }).eq("id", id));
}

export async function updateCardPosition(id: number, position: number): Promise<void> {
  must(await supabase.from("card").update({ position }).eq("id", id));
}

export async function updateCardPositions(items: { id: number; position: number }[]): Promise<void> {
  must(await supabase.rpc("set_card_positions", { p_items: items }));
}

export async function moveCardToList(id: number, listId: number, position: number): Promise<void> {
  must(await supabase.from("card").update({ list_id: listId, position }).eq("id", id));
}

export async function listArchivedCards(boardId: number): Promise<Card[]> {
  return must(
    await supabase
      .from("card")
      .select("*")
      .eq("board_id", boardId)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false }),
  );
}

export async function restoreCard(id: number): Promise<void> {
  must(await supabase.from("card").update({ archived_at: null }).eq("id", id));
}

export async function deleteCardPermanently(id: number): Promise<void> {
  must(await supabase.from("card").delete().eq("id", id));
}

export async function countCards(listId: number): Promise<number> {
  const { count, error } = await supabase.from("card").select("*", { count: "exact", head: true }).eq("list_id", listId);
  if (error) throw error;
  return count ?? 0;
}
