// De número do dashboard para filtro do board: o único mapa. O teste ao lado confere, com a
// demonstração, que o board filtrado mostra exatamente a quantidade que o dashboard exibe.
import { EMPTY_FILTERS, type BoardFilters } from "./boardFilters";
import { STALLED_DAYS, type AlertKind, type AttentionAlert } from "./dashboardRules";

/** Conjuntos de tarefas que o board sabe mostrar (o que está aberto hoje). */
export type LinkKind = "inProgress" | "overdue" | "stalled" | "dueSoon" | "open";

const LINK_FILTER: Record<LinkKind, Partial<BoardFilters>> = {
  inProgress: { column: "doing" },
  overdue: { due: "overdue" },
  stalled: { stalled: STALLED_DAYS },
  dueSoon: { due: "soon" },
  open: { column: "open" },
};

const ALERT_LINK: Record<AlertKind, LinkKind> = { overdue: "overdue", overload: "inProgress", stalled: "stalled", dueSoon: "dueSoon" };

/** Filtros do board para um conjunto, de uma pessoa (slug) ou da equipe (null). */
export function linkFilters(kind: LinkKind, assignee: string | null): BoardFilters {
  return { ...EMPTY_FILTERS, assignee, ...LINK_FILTER[kind] };
}

/** Filtros do board que mostram as tarefas de um alerta do Atenção. */
export function alertFilters(alert: AttentionAlert, slugs: Map<string, string>): BoardFilters {
  return linkFilters(ALERT_LINK[alert.kind], alert.personId ? (slugs.get(alert.personId) ?? null) : null);
}
