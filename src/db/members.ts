import { getDb } from "./client";
import type { BoardStatusSummary, Member, MemberRequestStats } from "../types";

export type MemberPatch = Partial<Pick<Member, "name" | "role" | "contact" | "notes" | "color">>;

const PATCHABLE_FIELDS = ["name", "role", "contact", "notes", "color"] as const;

export async function getMembers(): Promise<Member[]> {
  const db = await getDb();
  return db.select<Member[]>("SELECT * FROM member ORDER BY position ASC");
}

export async function createMember(name: string, color: string): Promise<number> {
  const db = await getDb();
  const maxPosition = await db.select<{ maxPosition: number | null }[]>(
    "SELECT MAX(position) as maxPosition FROM member",
  );
  const position = (maxPosition[0]?.maxPosition ?? 0) + 1;
  const result = await db.execute("INSERT INTO member (name, color, position) VALUES ($1, $2, $3)", [
    name,
    color,
    position,
  ]);
  return result.lastInsertId ?? 0;
}

export async function updateMember(id: number, patch: MemberPatch): Promise<void> {
  const fields = PATCHABLE_FIELDS.filter((f) => patch[f] !== undefined);
  if (fields.length === 0) return;
  const db = await getDb();
  const assignments = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
  await db.execute(`UPDATE member SET ${assignments} WHERE id = $${fields.length + 1}`, [
    ...fields.map((f) => patch[f]),
    id,
  ]);
}

export async function deleteMember(id: number): Promise<void> {
  const db = await getDb();
  // Foreign keys are off (client.ts never enables the pragma), so no ON DELETE would fire —
  // clear the reference by hand. No archived_at filter: an archived card restored later must
  // not point at a member that no longer exists.
  await db.execute("UPDATE card SET requested_by = NULL WHERE requested_by = $1", [id]);
  await db.execute("DELETE FROM member WHERE id = $1", [id]);
}

export async function getStatusSummaryByBoard(): Promise<BoardStatusSummary[]> {
  const db = await getDb();
  // LEFT JOINs keep boards with no (unarchived) cards in the table, with zero counts.
  return db.select<BoardStatusSummary[]>(
    `SELECT board.id AS board_id, board.name AS board_name,
       COALESCE(SUM(card.status = 'planned'), 0) AS planned,
       COALESCE(SUM(card.status = 'in_progress'), 0) AS in_progress,
       COALESCE(SUM(card.status = 'done'), 0) AS done
     FROM board
     LEFT JOIN list ON list.board_id = board.id
     LEFT JOIN card ON card.list_id = list.id AND card.archived_at IS NULL
     GROUP BY board.id
     ORDER BY board.position ASC`,
  );
}

export async function getMemberRequestStats(): Promise<MemberRequestStats[]> {
  const db = await getDb();
  return db.select<MemberRequestStats[]>(
    `SELECT requested_by AS member_id,
       SUM(status = 'planned') AS planned,
       SUM(status = 'in_progress') AS in_progress,
       SUM(status = 'done') AS done
     FROM card
     WHERE requested_by IS NOT NULL AND archived_at IS NULL
     GROUP BY requested_by`,
  );
}
