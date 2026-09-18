import { getDb } from "./client";
import type { ChecklistItem } from "../types";

type ChecklistItemRow = Omit<ChecklistItem, "done"> & { done: number };

function toChecklistItem(row: ChecklistItemRow): ChecklistItem {
  return { ...row, done: row.done === 1 };
}

export async function listChecklistItems(cardId: number): Promise<ChecklistItem[]> {
  const db = await getDb();
  const rows = await db.select<ChecklistItemRow[]>(
    "SELECT * FROM checklist_item WHERE card_id = $1 ORDER BY position ASC",
    [cardId],
  );
  return rows.map(toChecklistItem);
}

export async function createChecklistItem(cardId: number, text: string): Promise<number> {
  const db = await getDb();
  const maxPosition = await db.select<{ maxPosition: number | null }[]>(
    "SELECT MAX(position) as maxPosition FROM checklist_item WHERE card_id = $1",
    [cardId],
  );
  const position = (maxPosition[0]?.maxPosition ?? 0) + 1;
  const result = await db.execute(
    "INSERT INTO checklist_item (card_id, text, position) VALUES ($1, $2, $3)",
    [cardId, text, position],
  );
  return result.lastInsertId ?? 0;
}

export async function toggleChecklistItem(id: number, done: boolean): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE checklist_item SET done = $1 WHERE id = $2", [done ? 1 : 0, id]);
}

export async function deleteChecklistItem(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM checklist_item WHERE id = $1", [id]);
}

export async function listChecklistProgressForCards(
  cardIds: number[],
): Promise<Map<number, { done: number; total: number }>> {
  const map = new Map<number, { done: number; total: number }>();
  if (cardIds.length === 0) return map;
  const db = await getDb();
  const placeholders = cardIds.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await db.select<{ card_id: number; done: number; total: number }[]>(
    `SELECT card_id, SUM(done) as done, COUNT(*) as total FROM checklist_item
     WHERE card_id IN (${placeholders}) GROUP BY card_id`,
    cardIds,
  );
  for (const row of rows) map.set(row.card_id, { done: row.done, total: row.total });
  return map;
}
