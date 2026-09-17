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

export async function moveList(id: number, direction: "left" | "right"): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ id: number; board_id: number; position: number }[]>(
    "SELECT id, board_id, position FROM list WHERE id = $1",
    [id],
  );
  const current = rows[0];
  if (!current) return;

  const neighborQuery =
    direction === "left"
      ? "SELECT id, position FROM list WHERE board_id = $1 AND position < $2 ORDER BY position DESC LIMIT 1"
      : "SELECT id, position FROM list WHERE board_id = $1 AND position > $2 ORDER BY position ASC LIMIT 1";
  const neighborRows = await db.select<{ id: number; position: number }[]>(neighborQuery, [
    current.board_id,
    current.position,
  ]);
  const neighbor = neighborRows[0];
  if (!neighbor) return;

  await db.execute("UPDATE list SET position = $1 WHERE id = $2", [neighbor.position, current.id]);
  await db.execute("UPDATE list SET position = $1 WHERE id = $2", [current.position, neighbor.id]);
}
