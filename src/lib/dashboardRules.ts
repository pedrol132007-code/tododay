// Limites das regras de risco do dashboard. Único lugar para ajustar: alertas, carga da equipe e a
// demonstração leem daqui.
import type { DashboardPerson, DashboardTask } from "../types";
import { daysBetween, statusOn } from "./metrics";

/** "Vence em breve": prazo entre hoje e hoje + N dias, ainda não concluída. */
export const DUE_SOON_DAYS = 3;

/** "Parada": em andamento e sem mudança de status há mais de N dias. */
export const STALLED_DAYS = 7;

/** "Sobrecarga": mais de N tarefas em andamento (limite fixo, não relativo à média). */
export const OVERLOAD_IN_PROGRESS = 8;

// As regras olham a tarefa como ela estava no fim de `day` (hoje, ou o último dia do período).
const isOpen = (t: DashboardTask, day: string) => {
  const status = statusOn(t, day);
  return status === "planned" || status === "in_progress";
};

/** Passou do prazo e não está concluída. */
export const isOverdue = (t: DashboardTask, day: string) => t.dueDay != null && t.dueDay < day && isOpen(t, day);

/** Não concluída, com prazo entre o dia e o dia + DUE_SOON_DAYS. */
export const isDueSoon = (t: DashboardTask, day: string) =>
  t.dueDay != null && isOpen(t, day) && t.dueDay >= day && daysBetween(day, t.dueDay) <= DUE_SOON_DAYS;

export const isInProgress = (t: DashboardTask, day: string) => statusOn(t, day) === "in_progress";

/** Em andamento e sem mudança de status há mais de STALLED_DAYS dias. Devolve os dias parada, ou null. */
export function stalledDays(t: DashboardTask, day: string): number | null {
  if (!isInProgress(t, day)) return null;
  const last = [...t.history].reverse().find((h) => h.day <= day)!;
  const days = daysBetween(last.day, day);
  return days > STALLED_DAYS ? days : null;
}

export const isOverloaded = (inProgress: number) => inProgress > OVERLOAD_IN_PROGRESS;

// ─── Alertas do bloco "Atenção" ───────────────────────────────────────────────

/** Quantos alertas o bloco mostra, no máximo. */
export const MAX_ALERTS = 5;

export type AlertKind = "overdue" | "overload" | "stalled" | "dueSoon";
export type AlertMatch = "overdue" | "inProgress" | "stalled" | "dueSoon";

export interface AttentionAlert {
  id: string;
  /** O fato do alerta (decide a ordem e o selo). */
  kind: AlertKind;
  /** Fato sobre carga e risco, nunca avaliação da pessoa. */
  text: string;
  personId?: string;
  /** Quais tarefas a lista do alerta mostra. */
  match: AlertMatch[];
  /** Outros fatos da mesma pessoa que ficaram de fora da frase (estão no detalhe dela). */
  more: number;
}

const SEVERITY: Record<AlertKind, number> = { overdue: 3, overload: 2, stalled: 1, dueSoon: 0 };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

interface Fact {
  kind: Exclude<AlertKind, "dueSoon">;
  match: AlertMatch;
  count: number;
  text: string;
}

/** Os fatos de risco de uma pessoa no dia, do mais grave para o menos grave. */
function personFacts(own: DashboardTask[], day: string): Fact[] {
  const overdue = own.filter((t) => isOverdue(t, day)).length;
  const inProgress = own.filter((t) => isInProgress(t, day)).length;
  const stalled = own.filter((t) => stalledDays(t, day) != null).length;
  const facts: Fact[] = [];
  if (overdue) facts.push({ kind: "overdue", match: "overdue", count: overdue, text: `${overdue} ${plural(overdue, "tarefa atrasada", "tarefas atrasadas")}` });
  if (isOverloaded(inProgress)) {
    facts.push({ kind: "overload", match: "inProgress", count: inProgress, text: `${inProgress} tarefas em andamento (limite ${OVERLOAD_IN_PROGRESS})` });
  }
  if (stalled) {
    facts.push({ kind: "stalled", match: "stalled", count: stalled, text: `${stalled} ${plural(stalled, "tarefa parada", "tarefas paradas")} há mais de ${STALLED_DAYS} dias` });
  }
  return facts;
}

/**
 * Alertas do dia, do mais grave para o menos grave (no máximo MAX_ALERTS), e um da equipe para
 * prazos próximos. Na equipe, cada pessoa em risco aparece uma vez, com o fato mais grave; os
 * outros ficam em `more`. Com `perFact` (o detalhe da pessoa), cada fato vira um alerta.
 */
export function attentionAlerts(
  people: DashboardPerson[],
  tasks: DashboardTask[],
  day: string,
  { perFact = false }: { perFact?: boolean } = {},
): AttentionAlert[] {
  const ranked: { alert: AttentionAlert; count: number; name: string }[] = [];

  for (const person of people) {
    const facts = personFacts(
      tasks.filter((t) => t.assigneeId === person.id),
      day,
    );
    const first = person.name.split(" ")[0];
    const shown = perFact ? facts : facts.slice(0, 1);
    for (const fact of shown) {
      ranked.push({
        alert: {
          id: `${fact.kind}-${person.id}`,
          kind: fact.kind,
          text: `${first} tem ${fact.text}`,
          personId: person.id,
          match: [fact.match],
          more: perFact ? 0 : facts.length - 1,
        },
        count: fact.count,
        name: person.name,
      });
    }
  }

  const dueSoon = tasks.filter((t) => isDueSoon(t, day)).length;
  if (dueSoon) {
    ranked.push({
      alert: {
        id: "dueSoon",
        kind: "dueSoon",
        text: `${dueSoon} ${plural(dueSoon, "tarefa vence", "tarefas vencem")} nos próximos ${DUE_SOON_DAYS} dias`,
        match: ["dueSoon"],
        more: 0,
      },
      count: dueSoon,
      name: "",
    });
  }

  return ranked
    .sort((a, b) => SEVERITY[b.alert.kind] - SEVERITY[a.alert.kind] || b.count - a.count || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, MAX_ALERTS)
    .map((r) => r.alert);
}

/** As tarefas que um alerta descreve (a lista aberta ao clicar nele). */
export function alertTasks(tasks: DashboardTask[], alert: AttentionAlert, day: string): DashboardTask[] {
  const test: Record<AlertMatch, (t: DashboardTask) => boolean> = {
    overdue: (t) => isOverdue(t, day),
    inProgress: (t) => isInProgress(t, day),
    stalled: (t) => stalledDays(t, day) != null,
    dueSoon: (t) => isDueSoon(t, day),
  };
  return tasks.filter((t) => (!alert.personId || t.assigneeId === alert.personId) && alert.match.some((m) => test[m](t)));
}

/** O que está parado e há quanto tempo, o mais antigo primeiro (para preparar a conversa individual). */
export function stalledList(tasks: DashboardTask[], day: string): { task: DashboardTask; days: number }[] {
  return tasks
    .map((task) => ({ task, days: stalledDays(task, day) }))
    .filter((x): x is { task: DashboardTask; days: number } => x.days != null)
    .sort((a, b) => b.days - a.days);
}
