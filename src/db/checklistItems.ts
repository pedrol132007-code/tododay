import { must, supabase } from "./supabase";
import type { ChecklistItem } from "../types";

// checklist_item.done já é boolean no Postgres: não há conversão de 0/1 aqui.

export async function listChecklistItems(cardId: number): Promise<ChecklistItem[]> {
  return must(await supabase.from("checklist_item").select("*").eq("card_id", cardId).order("position"));
}

export async function createChecklistItem(cardId: number, text: string): Promise<number> {
  const last = must(
    await supabase
      .from("checklist_item")
      .select("position")
      .eq("card_id", cardId)
      .order("position", { ascending: false })
      .limit(1),
  );
  const position = (last[0]?.position ?? 0) + 1;
  const row = must(
    await supabase.from("checklist_item").insert({ card_id: cardId, text, position }).select("id").single(),
  );
  return row.id;
}

export async function toggleChecklistItem(id: number, done: boolean): Promise<void> {
  must(await supabase.from("checklist_item").update({ done }).eq("id", id));
}

export async function deleteChecklistItem(id: number): Promise<void> {
  must(await supabase.from("checklist_item").delete().eq("id", id));
}

export async function listChecklistProgressForCards(
  cardIds: number[],
): Promise<Map<number, { done: number; total: number }>> {
  const map = new Map<number, { done: number; total: number }>();
  if (cardIds.length === 0) return map;
  const rows = must(
    await supabase
      .from("checklist_item")
      .select("card_id, done")
      .in("card_id", cardIds)
      .returns<Pick<ChecklistItem, "card_id" | "done">[]>(),
  );
  for (const row of rows) {
    const progress = map.get(row.card_id) ?? { done: 0, total: 0 };
    progress.total += 1;
    if (row.done) progress.done += 1;
    map.set(row.card_id, progress);
  }
  return map;
}
