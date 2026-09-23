import { getDb } from "./client";
import type { Card, CardStatus } from "../types";

export async function listCards(listId: number): Promise<Card[]> {
  const db = await getDb();
  return db.select<Card[]>(
    "SELECT * FROM card WHERE list_id = $1 AND archived_at IS NULL ORDER BY position ASC",
    [listId],
  );
}

export async function createCard(
  listId: number,
  title: string,
  status: CardStatus = "planned",
  requestedBy: number | null = null,
): Promise<number> {
  const db = await getDb();
  const maxPosition = await db.select<{ maxPosition: number | null }[]>(
    "SELECT MAX(position) as maxPosition FROM card WHERE list_id = $1",
    [listId],
  );
  const position = (maxPosition[0]?.maxPosition ?? 0) + 1;
  const result = await db.execute(
    "INSERT INTO card (list_id, title, position, status, requested_by) VALUES ($1, $2, $3, $4, $5)",
    [listId, title, position, status, requestedBy],
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

export async function updateCardDescription(id: number, description: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE card SET description = $1, updated_at = datetime('now') WHERE id = $2",
    [description, id],
  );
}

export async function updateCardDueDate(id: number, dueDate: string | null): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE card SET due_date = $1, updated_at = datetime('now') WHERE id = $2",
    [dueDate, id],
  );
}

export async function updateCardStatus(id: number, status: CardStatus): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE card SET status = $1, updated_at = datetime('now') WHERE id = $2", [
    status,
    id,
  ]);
}

export async function updateCardRequestedBy(id: number, memberId: number | null): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE card SET requested_by = $1, updated_at = datetime('now') WHERE id = $2",
    [memberId, id],
  );
}

export async function archiveCard(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE card SET archived_at = datetime('now') WHERE id = $1", [id]);
}

export async function updateCardPosition(id: number, position: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE card SET position = $1 WHERE id = $2", [position, id]);
}

export async function updateCardPositions(items: { id: number; position: number }[]): Promise<void> {
  const db = await getDb();
  for (const item of items) {
    await db.execute("UPDATE card SET position = $1 WHERE id = $2", [item.position, item.id]);
  }
}

export async function moveCardToList(id: number, listId: number, position: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE card SET list_id = $1, position = $2 WHERE id = $3", [listId, position, id]);
}

export async function listArchivedCards(boardId: number): Promise<Card[]> {
  const db = await getDb();
  return db.select<Card[]>(
    `SELECT card.* FROM card JOIN list ON card.list_id = list.id
     WHERE list.board_id = $1 AND card.archived_at IS NOT NULL
     ORDER BY card.archived_at DESC`,
    [boardId],
  );
}

export async function restoreCard(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE card SET archived_at = NULL WHERE id = $1", [id]);
}

export async function deleteCardPermanently(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM card WHERE id = $1", [id]);
}

export async function countCards(listId: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM card WHERE list_id = $1",
    [listId],
  );
  return rows[0]?.count ?? 0;
}
