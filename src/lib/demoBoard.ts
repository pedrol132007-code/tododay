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

// ─── Anexos de exemplo ────────────────────────────────────────────────────────

export type DemoArt = "receipt" | "chart" | "screenshot" | "contract";

/** Um anexo fictício: o arquivo é desenhado no navegador (imagem) ou montado à mão (PDF). */
export interface DemoAttachment {
  id: string;
  taskId: string;
  name: string;
  kind: "image" | "pdf";
  art: DemoArt;
  uploaderId: string;
  day: string;
  isCover: boolean;
}

/** Parte dos cards abertos tem anexos; a primeira imagem vira capa. Sai só dos dados. */
export function demoAttachments(d: DashboardData): Map<string, DemoAttachment[]> {
  const open = demoBoard(d)
    .filter((l) => l.status !== "done")
    .flatMap((l) => l.tasks)
    .filter((t) => spread(`${t.id}-anexo`) < 0.2);
  const map = new Map<string, DemoAttachment[]>();
  let covered = false;
  open.forEach((t, i) => {
    const n = 1 + Math.floor(spread(`${t.id}-quantos`) * 3);
    const list: DemoAttachment[] = [];
    for (let k = 0; k < n; k++) {
      // Garante os dois tipos: o primeiro card começa por uma imagem (a capa) e o segundo, por um PDF.
      const pdf = i === 0 && k === 0 ? false : i === 1 && k === 0 ? true : spread(`${t.id}-${k}`) < 0.35;
      const art: DemoArt = pdf ? "contract" : (["receipt", "chart", "screenshot"] as const)[Math.floor(spread(`${t.id}-arte-${k}`) * 3)];
      const names: Record<DemoArt, string> = {
        receipt: `nota-fiscal-${1000 + Math.floor(spread(`${t.id}-nf-${k}`) * 9000)}.png`,
        chart: "grafico-do-mes.png",
        screenshot: "print-da-tela.png",
        contract: ["minuta-de-contrato.pdf", "proposta-comercial.pdf", "ata-da-reuniao.pdf"][k % 3],
      };
      // Mesmo nome duas vezes no card ganha número: "print-da-tela-2.png".
      const base = names[art];
      const name = list.some((x) => x.name === base) ? base.replace(/\.(\w+)$/, `-${k + 1}.$1`) : base;
      const isCover = !covered && !pdf;
      covered ||= isCover;
      list.push({ id: `${t.id}-a${k}`, taskId: t.id, name, kind: pdf ? "pdf" : "image", art, uploaderId: t.assigneeId, day: t.createdDay, isCover });
    }
    map.set(t.id, list);
  });
  return map;
}
