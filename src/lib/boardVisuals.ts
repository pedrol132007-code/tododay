// Regras visuais do board: selo de vencimento e cor de cada pessoa.

export type DueState = "overdue" | "today" | "upcoming";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// due_date vem como "AAAA-MM-DD", sem fuso: compara como data local, não como instante.
function parseDate(due: string): { y: number; m: number; d: number } {
  const [y, m, d] = due.split("-").map(Number);
  return { y, m, d };
}

const dayKey = (y: number, m: number, d: number) => y * 10_000 + m * 100 + d;

export function dueState(due: string | null, today: Date): DueState | null {
  if (!due) return null;
  const { y, m, d } = parseDate(due);
  const target = dayKey(y, m, d);
  const now = dayKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
  if (target < now) return "overdue";
  return target === now ? "today" : "upcoming";
}

export function formatDue(due: string, today: Date): string {
  const { y, m, d } = parseDate(due);
  const base = `${d} ${MONTHS[m - 1]}`;
  return y === today.getFullYear() ? base : `${base} ${y}`;
}

// Tons médios que aguentam texto branco e se destacam tanto no creme quanto no grafite.
export const MEMBER_COLORS = [
  "#2538ff", // azul Benner
  "#e51e47", // vermelho Benner
  "#7b3fe4",
  "#0e8a6a",
  "#c2410c",
  "#0369a1",
  "#be185d",
  "#4d7c0f",
];

export function memberColor(userId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return MEMBER_COLORS[(hash >>> 0) % MEMBER_COLORS.length];
}
