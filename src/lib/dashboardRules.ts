// Limites das regras de risco do dashboard. Único lugar para ajustar: alertas, carga da equipe e a
// demonstração leem daqui.
import type { DashboardTask } from "../types";
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
