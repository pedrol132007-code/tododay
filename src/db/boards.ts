import { getDb } from "./client";
import type { Board } from "../types";

export async function listBoards(): Promise<Board[]> {
  const db = await getDb();
  return db.select<Board[]>("SELECT * FROM board ORDER BY position ASC");
}

export async function createBoard(name: string): Promise<number> {
  const db = await getDb();
  const maxPosition = await db.select<{ maxPosition: number | null }[]>(
    "SELECT MAX(position) as maxPosition FROM board",
  );
  const position = (maxPosition[0]?.maxPosition ?? 0) + 1;
  const result = await db.execute("INSERT INTO board (name, position) VALUES ($1, $2)", [
    name,
    position,
  ]);
  return result.lastInsertId ?? 0;
}
