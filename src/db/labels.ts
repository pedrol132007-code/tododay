import { getDb } from "./client";
import type { Label } from "../types";

export async function listLabels(boardId: number): Promise<Label[]> {
  const db = await getDb();
  return db.select<Label[]>("SELECT * FROM label WHERE board_id = $1 ORDER BY id ASC", [boardId]);
}

export async function createLabel(boardId: number, name: string, color: string): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO label (board_id, name, color) VALUES ($1, $2, $3)",
    [boardId, name, color],
  );
  return result.lastInsertId ?? 0;
}

export async function deleteLabel(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM label WHERE id = $1", [id]);
}

export async function listCardLabels(cardId: number): Promise<Label[]> {
  const db = await getDb();
  return db.select<Label[]>(
    "SELECT label.* FROM label JOIN card_label ON label.id = card_label.label_id WHERE card_label.card_id = $1",
    [cardId],
  );
}

export async function listLabelsForCards(cardIds: number[]): Promise<Map<number, Label[]>> {
  const map = new Map<number, Label[]>();
  if (cardIds.length === 0) return map;
  const db = await getDb();
  const placeholders = cardIds.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await db.select<(Label & { card_id: number })[]>(
    `SELECT label.*, card_label.card_id FROM label
     JOIN card_label ON label.id = card_label.label_id
     WHERE card_label.card_id IN (${placeholders})`,
    cardIds,
  );
  for (const { card_id, ...label } of rows) {
    const existing = map.get(card_id) ?? [];
    existing.push(label);
    map.set(card_id, existing);
  }
  return map;
}

export async function setCardLabel(cardId: number, labelId: number, on: boolean): Promise<void> {
  const db = await getDb();
  if (on) {
    await db.execute("INSERT OR IGNORE INTO card_label (card_id, label_id) VALUES ($1, $2)", [cardId, labelId]);
  } else {
    await db.execute("DELETE FROM card_label WHERE card_id = $1 AND label_id = $2", [cardId, labelId]);
  }
}
