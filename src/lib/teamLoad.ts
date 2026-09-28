// Carga da equipe: o que cada pessoa tem nas mãos no fim do período e o risco que isso carrega.
// Carga é contagem de tarefas (não existe estimativa de esforço no modelo).
import type { DashboardPerson, DashboardTask } from "../types";
import { isInProgress, isOverdue, isOverloaded, stalledDays } from "./dashboardRules";
import { periodMetrics, type DayRange } from "./metrics";

export interface PersonLoad {
  person: DashboardPerson;
  /** Em andamento no último dia do período. */
  inProgress: number;
  /** Abertas com prazo vencido no último dia do período. */
  overdue: number;
  /** Em andamento sem mudar de status há mais de STALLED_DAYS dias. */
  stalled: number;
  overloaded: boolean;
  delivered: number;
  onTimeRate: number | null;
}

/** Uma linha por pessoa, na ordem de risco: mais atrasadas, depois mais carga (nunca por entregas). */
export function teamLoad(people: DashboardPerson[], tasks: DashboardTask[], r: DayRange): PersonLoad[] {
  const day = r.end;
  return people
    .map((person) => {
      const own = tasks.filter((t) => t.assigneeId === person.id);
      const inProgress = own.filter((t) => isInProgress(t, day)).length;
      const m = periodMetrics(own, r);
      return {
        person,
        inProgress,
        overdue: own.filter((t) => isOverdue(t, day)).length,
        stalled: own.filter((t) => stalledDays(t, day) != null).length,
        overloaded: isOverloaded(inProgress),
        delivered: m.delivered,
        onTimeRate: m.onTimeRate,
      };
    })
    .sort((a, b) => b.overdue - a.overdue || b.inProgress - a.inProgress || a.person.name.localeCompare(b.person.name, "pt-BR"));
}
