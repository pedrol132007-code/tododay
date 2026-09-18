import { getDb } from "./client";
import type { SearchResult } from "../types";

export async function searchCards(query: string): Promise<SearchResult[]> {
  const db = await getDb();
  const like = `%${query}%`;
  return db.select<SearchResult[]>(
    `SELECT 'card' as type, card.id, card.title, list.board_id, board.name as board_name
     FROM card
     JOIN list ON card.list_id = list.id
     JOIN board ON list.board_id = board.id
     WHERE card.archived_at IS NULL AND (card.title LIKE $1 OR card.description LIKE $1)
     ORDER BY card.updated_at DESC
     LIMIT 20`,
    [like],
  );
}

export async function searchLists(query: string): Promise<SearchResult[]> {
  const db = await getDb();
  const like = `%${query}%`;
  return db.select<SearchResult[]>(
    `SELECT 'list' as type, list.id, list.name as title, list.board_id, board.name as board_name
     FROM list
     JOIN board ON list.board_id = board.id
     WHERE list.name LIKE $1
     ORDER BY list.name ASC
     LIMIT 10`,
    [like],
  );
}

export async function search(query: string): Promise<SearchResult[]> {
  const [cards, lists] = await Promise.all([searchCards(query), searchLists(query)]);
  return [...cards, ...lists];
}
