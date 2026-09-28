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
  /** O fato mais grave do alerta (decide a ordem e o selo). */
  kind: AlertKind;
  /** Fato sobre carga e risco, nunca avaliação da pessoa. */
  text: string;
  personId?: string;
  /** Quais tarefas a lista do alerta mostra. */
  match: AlertMatch[];
}

const SEVERITY: Record<AlertKind, number> = { overdue: 3, overload: 2, stalled: 1, dueSoon: 0 };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "a", "a e b", "a, b e c". */
function joinFacts(facts: string[]): string {
  return facts.length <= 1 ? facts.join("") : `${facts.slice(0, -1).join(", ")} e ${facts[facts.length - 1]}`;
}

/**
 * Alertas do dia, do mais grave para o menos grave (no máximo MAX_ALERTS): um por pessoa em risco,
 * juntando atrasadas, sobrecarga e paradas numa frase, e um da equipe para prazos próximos.
 */
export function attentionAlerts(people: DashboardPerson[], tasks: DashboardTask[], day: string): AttentionAlert[] {
  const ranked: { alert: AttentionAlert; count: number; name: string }[] = [];

  for (const person of people) {
    const own = tasks.filter((t) => t.assigneeId === person.id);
    const overdue = own.filter((t) => isOverdue(t, day)).length;
    const inProgress = own.filter((t) => isInProgress(t, day)).length;
    const stalled = own.filter((t) => stalledDays(t, day) != null).length;
    const overloaded = isOverloaded(inProgress);

    // A palavra "tarefa" só no primeiro fato: "3 tarefas atrasadas, 10 em andamento e 1 parada".
    const facts: string[] = [];
    const noun = (n: number) => (facts.length === 0 ? ` ${plural(n, "tarefa", "tarefas")}` : "");
    if (overdue) facts.push(`${overdue}${noun(overdue)} ${plural(overdue, "atrasada", "atrasadas")}`);
    if (overloaded) facts.push(`${inProgress} em andamento (limite ${OVERLOAD_IN_PROGRESS})`);
    if (stalled) facts.push(`${stalled}${noun(stalled)} ${plural(stalled, "parada", "paradas")} há mais de ${STALLED_DAYS} dias`);
    if (facts.length === 0) continue;

    const kind: AlertKind = overdue ? "overdue" : overloaded ? "overload" : "stalled";
    const match: AlertMatch[] = [];
    if (overdue) match.push("overdue");
    if (overloaded) match.push("inProgress");
    if (stalled) match.push("stalled");
    ranked.push({
      alert: { id: `${kind}-${person.id}`, kind, text: `${person.name.split(" ")[0]} tem ${joinFacts(facts)}`, personId: person.id, match },
      count: kind === "overdue" ? overdue : kind === "overload" ? inProgress : stalled,
      name: person.name,
    });
  }

  const dueSoon = tasks.filter((t) => isDueSoon(t, day)).length;
  if (dueSoon) {
    ranked.push({
      alert: {
        id: "dueSoon",
        kind: "dueSoon",
        text: `${dueSoon} ${plural(dueSoon, "tarefa vence", "tarefas vencem")} nos próximos ${DUE_SOON_DAYS} dias`,
        match: ["dueSoon"],
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
