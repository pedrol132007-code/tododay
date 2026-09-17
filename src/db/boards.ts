import { getDb } from "./client";
import type { Board } from "../types";

export async function listBoards(): Promise<Board[]> {
  const db = await getDb();
  return db.select<Board[]>("SELECT * FROM board ORDER BY position ASC");
}
