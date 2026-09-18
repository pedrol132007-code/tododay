import { getDb } from "./client";
import type { SearchResult } from "../types";

export async function searchCards(query: string): Promise<SearchResult[]> {
  const db = await getDb();
  const like = `%${query}%`;
  return db.select<SearchResult[]>(
    `SELECT card.id, card.title, card.list_id, list.board_id, board.name as board_name
     FROM card
     JOIN list ON card.list_id = list.id
     JOIN board ON list.board_id = board.id
     WHERE card.archived_at IS NULL AND (card.title LIKE $1 OR card.description LIKE $1)
     ORDER BY card.updated_at DESC
     LIMIT 20`,
    [like],
  );
}
