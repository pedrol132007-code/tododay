import { getDb } from "./client";
import type { List } from "../types";

export async function listLists(boardId: number): Promise<List[]> {
  const db = await getDb();
  return db.select<List[]>("SELECT * FROM list WHERE board_id = $1 ORDER BY position ASC", [
    boardId,
  ]);
}

export async function createList(boardId: number, name: string): Promise<number> {
  const db = await getDb();
  const maxPosition = await db.select<{ maxPosition: number | null }[]>(
    "SELECT MAX(position) as maxPosition FROM list WHERE board_id = $1",
    [boardId],
  );
  const position = (maxPosition[0]?.maxPosition ?? 0) + 1;
  const result = await db.execute(
    "INSERT INTO list (board_id, name, position) VALUES ($1, $2, $3)",
    [boardId, name, position],
  );
  return result.lastInsertId ?? 0;
}

export async function renameList(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE list SET name = $1 WHERE id = $2", [name, id]);
}

export async function deleteList(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM list WHERE id = $1", [id]);
}

export async function updateListPosition(id: number, position: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE list SET position = $1 WHERE id = $2", [position, id]);
}

export async function updateListPositions(items: { id: number; position: number }[]): Promise<void> {
  const db = await getDb();
  for (const item of items) {
    await db.execute("UPDATE list SET position = $1 WHERE id = $2", [item.position, item.id]);
  }
}
