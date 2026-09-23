import { must, supabase } from "./supabase";
import type { Label } from "../types";

export async function listLabels(boardId: number): Promise<Label[]> {
  return must(await supabase.from("label").select("*").eq("board_id", boardId).order("id"));
}

export async function createLabel(boardId: number, name: string, color: string): Promise<number> {
  const row = must(await supabase.from("label").insert({ board_id: boardId, name, color }).select("id").single());
  return row.id;
}

export async function deleteLabel(id: number): Promise<void> {
  must(await supabase.from("label").delete().eq("id", id));
}

export async function listCardLabels(cardId: number): Promise<Label[]> {
  const rows = must(
    await supabase.from("card_label").select("label(*)").eq("card_id", cardId).returns<{ label: Label }[]>(),
  );
  return rows.map((row) => row.label);
}

export async function listLabelsForCards(cardIds: number[]): Promise<Map<number, Label[]>> {
  const map = new Map<number, Label[]>();
  if (cardIds.length === 0) return map;
  const rows = must(
    await supabase
      .from("card_label")
      .select("card_id, label(*)")
      .in("card_id", cardIds)
      .returns<{ card_id: number; label: Label }[]>(),
  );
  for (const { card_id, label } of rows) {
    const existing = map.get(card_id) ?? [];
    existing.push(label);
    map.set(card_id, existing);
  }
  return map;
}

export async function setCardLabel(cardId: number, labelId: number, on: boolean): Promise<void> {
  if (on) {
    must(
      await supabase
        .from("card_label")
        .upsert({ card_id: cardId, label_id: labelId }, { ignoreDuplicates: true }),
    );
  } else {
    must(await supabase.from("card_label").delete().eq("card_id", cardId).eq("label_id", labelId));
  }
}
