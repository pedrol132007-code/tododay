// De número do dashboard para filtro do board: o único mapa. O teste ao lado confere, com a
// demonstração, que o board filtrado mostra exatamente a quantidade que o dashboard exibe.
import { EMPTY_FILTERS, filtersToSearch, type BoardFilters } from "./boardFilters";
import { STALLED_DAYS, type AlertKind, type AttentionAlert } from "./dashboardRules";
import { PERIOD_PRESETS, type PeriodPreset, type PeriodSelection } from "./metrics";

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

// ─── Estado na URL ────────────────────────────────────────────────────────────
// O período e a pessoa do dashboard ficam na URL enquanto se vai ao board, para o "Voltar ao
// dashboard" abrir do mesmo jeito. O link leva também de onde veio (para os chips) e o card a abrir.

const DEFAULT_PRESET: PeriodPreset = "12w";
export const DEFAULT_PERIOD: PeriodSelection = { kind: "preset", preset: DEFAULT_PRESET };

export interface DashboardViewState {
  period: PeriodSelection;
  /** Slug da pessoa (personSlugs), ou null para a equipe. */
  person: string | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseDashboardView(search: string): DashboardViewState {
  const p = new URLSearchParams(search);
  const preset = PERIOD_PRESETS.find((x) => x.id === p.get("periodo"))?.id;
  const start = p.get("de") ?? "", end = p.get("ate") ?? "";
  const period: PeriodSelection = preset
    ? { kind: "preset", preset }
    : DAY.test(start) && DAY.test(end) && start <= end
      ? { kind: "custom", range: { start, end } }
      : DEFAULT_PERIOD;
  return { period, person: p.get("pessoa") || null };
}

export function dashboardViewToSearch(state: DashboardViewState, current = ""): string {
  const p = new URLSearchParams(current);
  for (const key of ["periodo", "de", "ate", "pessoa"]) p.delete(key);
  const { period } = state;
  if (period.kind === "custom") {
    p.set("de", period.range.start);
    p.set("ate", period.range.end);
  } else if (period.preset !== DEFAULT_PRESET) {
    p.set("periodo", period.preset);
  }
  if (state.person) p.set("pessoa", state.person);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export interface BoardLink {
  /** De onde no dashboard veio o filtro ("Atenção · Ana tem 2 tarefas atrasadas"). */
  origin: string | null;
  /** Id da tarefa a abrir no board. */
  card: string | null;
}

export function parseBoardLink(search: string): BoardLink {
  const p = new URLSearchParams(search);
  return { origin: p.get("origem") || null, card: p.get("card") || null };
}

/** Um link do dashboard para o board: os filtros, de onde veio e (opcional) o card a abrir. */
export type BoardLinkTarget = BoardLink & { filters: BoardFilters };

/** A URL do board aberto por um link do dashboard (o estado do dashboard continua nela). */
export function boardLinkToSearch(link: BoardLinkTarget, current = ""): string {
  const p = new URLSearchParams(filtersToSearch(link.filters, current));
  p.delete("origem");
  p.delete("card");
  if (link.origin) p.set("origem", link.origin);
  if (link.card) p.set("card", link.card);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Volta ao dashboard: tira filtros, origem e card; o período e a pessoa ficam. */
export function clearBoardLink(current: string): string {
  return boardLinkToSearch({ filters: EMPTY_FILTERS, origin: null, card: null }, current);
}
