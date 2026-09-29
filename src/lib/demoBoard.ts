// Board de demonstração: as mesmas tarefas fictícias do dashboard, vistas como colunas no dia de
// hoje. Sai dos dados da demonstração (nada é sorteado aqui), então board e dashboard contam igual.
import type { DashboardData, DashboardTask, ListStatus } from "../types";
import { PRIORITIES } from "./boardVisuals";
import { completedDay, daysBetween, statusOn } from "./metrics";
import { stalledDays } from "./dashboardRules";

export const DEMO_BOARD_NAME = "Operações";

/** Etiquetas do board de demonstração. Sem vermelho, rosa nem laranja, que no card falam de prazo e prioridade. */
export const DEMO_LABELS = [
  { id: "financeiro", name: "Financeiro", color: "#0e8a6a" },
  { id: "juridico", name: "Jurídico", color: "#7b3fe4" },
  { id: "compras", name: "Compras", color: "#4d7c0f" },
  { id: "cliente", name: "Cliente", color: "#2538ff" },
  { id: "sistemas", name: "Sistemas", color: "#0369a1" },
  { id: "pessoas", name: "Pessoas", color: "#475569" },
] as const;

export type DemoLabelId = (typeof DEMO_LABELS)[number]["id"];

/** A coluna Concluído mostra o que foi entregue nos últimos N dias (o resto já teria sido arquivado). */
export const DEMO_DONE_DAYS = 7;

export interface DemoList {
  id: string;
  name: string;
  status: ListStatus;
  wipLimit: number | null;
  tasks: DashboardTask[];
}

/** Número estável de 0 a 1 por tarefa, para decidir a coluna sem sortear de novo. */
function spread(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967296;
}

const priorityRank = (t: DashboardTask) => (t.priority ? PRIORITIES.indexOf(t.priority) : PRIORITIES.length);

/** Mais urgente primeiro; depois o prazo mais próximo; sem prazo por último. */
const byUrgency = (a: DashboardTask, b: DashboardTask) =>
  priorityRank(a) - priorityRank(b) || (a.dueDay ?? "9999").localeCompare(b.dueDay ?? "9999") || a.id.localeCompare(b.id);

/**
 * As colunas no dia de hoje. Em andamento se divide em duas: parte do que já anda há alguns dias
 * está "Em revisão" (nunca o que está parado, que continua em "Em andamento").
 */
export function demoBoard(d: DashboardData): DemoList[] {
  const todo: DashboardTask[] = [], doing: DashboardTask[] = [], review: DashboardTask[] = [], done: DashboardTask[] = [];
  for (const t of d.tasks) {
    const status = statusOn(t, d.today);
    if (status === "planned") todo.push(t);
    else if (status === "done") {
      if (daysBetween(completedDay(t)!, d.today) < DEMO_DONE_DAYS) done.push(t);
    } else if (status === "in_progress") {
      const started = t.history.find((h) => h.to === "in_progress")!.day;
      const inReview = stalledDays(t, d.today) == null && daysBetween(started, d.today) >= 2 && spread(t.id) < 0.4;
      (inReview ? review : doing).push(t);
    }
  }
  return [
    { id: "todo", name: "A fazer", status: "todo", wipLimit: null, tasks: todo.sort(byUrgency) },
    { id: "doing", name: "Em andamento", status: "doing", wipLimit: 25, tasks: doing.sort(byUrgency) },
    { id: "review", name: "Em revisão", status: "doing", wipLimit: 5, tasks: review.sort(byUrgency) },
    {
      id: "done",
      name: "Concluído",
      status: "done",
      wipLimit: null,
      tasks: done.sort((a, b) => completedDay(b)!.localeCompare(completedDay(a)!) || a.id.localeCompare(b.id)),
    },
  ];
}
