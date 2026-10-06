import { PRIORITIES } from "./boardVisuals";
import { daysBetween } from "./metrics";
import type { CardPriority } from "../types";

// Minhas tarefas (menu da pessoa): os cards dela por prazo. "Hoje" é o dia local, o mesmo do selo
// de prazo; "Esta semana" vai de amanhã até domingo.
export type MyTaskGroupId = "overdue" | "today" | "week" | "later" | "none";

const GROUPS: { id: MyTaskGroupId; label: string }[] = [
  { id: "overdue", label: "Atrasadas" },
  { id: "today", label: "Hoje" },
  { id: "week", label: "Esta semana" },
  { id: "later", label: "Depois" },
  { id: "none", label: "Sem prazo" },
];

type Groupable = { due_date: string | null; priority: CardPriority | null; title: string };

function groupOf(due: string | null, today: string): MyTaskGroupId {
  if (!due) return "none";
  const days = daysBetween(today, due);
  const toSunday = (7 - new Date(`${today}T00:00:00Z`).getUTCDay()) % 7;
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= toSunday) return "week";
  return "later";
}

const rank = (p: CardPriority | null) => (p ? PRIORITIES.indexOf(p) : PRIORITIES.length);

function compare(a: Groupable, b: Groupable): number {
  return (a.due_date ?? "").localeCompare(b.due_date ?? "") || rank(a.priority) - rank(b.priority) || a.title.localeCompare(b.title);
}

export function groupMyTasks<T extends Groupable>(tasks: T[], today: string): { id: MyTaskGroupId; label: string; tasks: T[] }[] {
  return GROUPS.map((g) => ({ ...g, tasks: tasks.filter((t) => groupOf(t.due_date, today) === g.id).sort(compare) })).filter(
    (g) => g.tasks.length > 0,
  );
}
