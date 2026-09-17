import { getDb } from "./client";
import type { Card } from "../types";

export async function listCards(listId: number): Promise<Card[]> {
  const db = await getDb();
  return db.select<Card[]>(
    "SELECT * FROM card WHERE list_id = $1 AND archived_at IS NULL ORDER BY position ASC",
    [listId],
  );
}

export async function createCard(listId: number, title: string): Promise<number> {
  const db = await getDb();
  const maxPosition = await db.select<{ maxPosition: number | null }[]>(
    "SELECT MAX(position) as maxPosition FROM card WHERE list_id = $1",
    [listId],
  );
  const position = (maxPosition[0]?.maxPosition ?? 0) + 1;
  const result = await db.execute(
    "INSERT INTO card (list_id, title, position) VALUES ($1, $2, $3)",
    [listId, title, position],
  );
  return result.lastInsertId ?? 0;
}

export async function renameCard(id: number, title: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE card SET title = $1, updated_at = datetime('now') WHERE id = $2", [
    title,
    id,
  ]);
}

export async function archiveCard(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE card SET archived_at = datetime('now') WHERE id = $1", [id]);
}

export async function moveCard(id: number, direction: "up" | "down"): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ id: number; list_id: number; position: number }[]>(
    "SELECT id, list_id, position FROM card WHERE id = $1",
    [id],
  );
  const current = rows[0];
  if (!current) return;

  const neighborQuery =
    direction === "up"
      ? "SELECT id, position FROM card WHERE list_id = $1 AND archived_at IS NULL AND position < $2 ORDER BY position DESC LIMIT 1"
      : "SELECT id, position FROM card WHERE list_id = $1 AND archived_at IS NULL AND position > $2 ORDER BY position ASC LIMIT 1";
  const neighborRows = await db.select<{ id: number; position: number }[]>(neighborQuery, [
    current.list_id,
    current.position,
  ]);
  const neighbor = neighborRows[0];
  if (!neighbor) return;

  await db.execute("UPDATE card SET position = $1 WHERE id = $2", [neighbor.position, current.id]);
  await db.execute("UPDATE card SET position = $1 WHERE id = $2", [current.position, neighbor.id]);
}

export async function countCards(listId: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM card WHERE list_id = $1",
    [listId],
  );
  return rows[0]?.count ?? 0;
}
