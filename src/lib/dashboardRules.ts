// Limites das regras de risco do dashboard. Único lugar para ajustar: alertas, carga da equipe e a
// demonstração leem daqui.
import type { DashboardTask } from "../types";
import { completedDay, daysBetween, statusOn } from "./metrics";

/** "Vence em breve": prazo entre hoje e hoje + N dias, ainda não concluída. */
export const DUE_SOON_DAYS = 3;

/** "Parada": em andamento e sem mudança de status há mais de N dias. */
export const STALLED_DAYS = 7;

/** "Sobrecarga": mais de N tarefas em andamento (limite fixo, não relativo à média). */
export const OVERLOAD_IN_PROGRESS = 8;

/** Passou do prazo e não está concluída. */
export const isOverdue = (t: DashboardTask, today: string) => t.dueDay != null && t.dueDay < today && completedDay(t) == null;

/** Não concluída, com prazo entre hoje e hoje + DUE_SOON_DAYS. */
export const isDueSoon = (t: DashboardTask, today: string) =>
  t.dueDay != null && completedDay(t) == null && t.dueDay >= today && daysBetween(today, t.dueDay) <= DUE_SOON_DAYS;

export const isInProgress = (t: DashboardTask, today: string) => statusOn(t, today) === "in_progress";

/** Em andamento e sem mudança de status há mais de STALLED_DAYS dias. Devolve os dias parada, ou null. */
export function stalledDays(t: DashboardTask, today: string): number | null {
  if (!isInProgress(t, today)) return null;
  const last = [...t.history].reverse().find((h) => h.day <= today)!;
  const days = daysBetween(last.day, today);
  return days > STALLED_DAYS ? days : null;
}

export const isOverloaded = (inProgress: number) => inProgress > OVERLOAD_IN_PROGRESS;
