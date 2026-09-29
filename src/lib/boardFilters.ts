// Busca, filtros e ordenação do board. Ficam na URL (?responsavel=ana&atrasadas=1), para um link
// do dashboard abrir o board já filtrado. Funções puras: o board real e o de demonstração usam as
// mesmas, e as regras de prazo e parada vêm de dashboardRules.
import type { CardPriority, ListStatus } from "../types";
import { PRIORITIES } from "./boardVisuals";
import { dueRisk } from "./dashboardRules";
import { daysBetween } from "./metrics";

export type DueFilter = "overdue" | "soon";
export type BoardSort = "manual" | "priority" | "due" | "stalled";

export interface BoardFilters {
  /** Texto buscado no título. */
  q: string;
  /** Slug da pessoa responsável (ver personSlugs). */
  assignee: string | null;
  priority: CardPriority | null;
  /** Slug do nome da etiqueta. */
  label: string | null;
  due: DueFilter | null;
  /** Paradas há mais de N dias (em coluna "Em andamento"). */
  stalled: number | null;
  sort: BoardSort;
}

export const EMPTY_FILTERS: BoardFilters = { q: "", assignee: null, priority: null, label: null, due: null, stalled: null, sort: "manual" };

/** Nomes na URL, em português como o resto da interface. */
const PRIORITY_PARAM: Record<CardPriority, string> = { urgent: "urgente", high: "alta", medium: "media", low: "baixa" };
const SORT_PARAM: Record<Exclude<BoardSort, "manual">, string> = { priority: "prioridade", due: "prazo", stalled: "parada" };
const PARAMS = ["busca", "responsavel", "prioridade", "etiqueta", "atrasadas", "vencendo", "paradas", "ordem"];

/** "Ana Souza" → "ana-souza": sem acento, minúsculo, hífen no lugar do resto. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Slug de cada pessoa: o primeiro nome ("ana"), ou o nome todo se dois têm o mesmo primeiro nome. */
export function personSlugs(people: { id: string; name: string }[]): Map<string, string> {
  const first = (name: string) => slugify(name.trim().split(/\s+/)[0] ?? "");
  const count = new Map<string, number>();
  for (const p of people) count.set(first(p.name), (count.get(first(p.name)) ?? 0) + 1);
  return new Map(people.map((p) => [p.id, count.get(first(p.name))! > 1 ? slugify(p.name) : first(p.name)]));
}

const findKey = <K extends string>(map: Record<K, string>, value: string | null) =>
  (Object.keys(map) as K[]).find((k) => map[k] === value) ?? null;

export function parseFilters(search: string): BoardFilters {
  const p = new URLSearchParams(search);
  const stalled = Number(p.get("paradas"));
  return {
    q: p.get("busca") ?? "",
    assignee: p.get("responsavel") || null,
    priority: findKey(PRIORITY_PARAM, p.get("prioridade")),
    label: p.get("etiqueta") || null,
    due: p.get("atrasadas") === "1" ? "overdue" : p.get("vencendo") === "1" ? "soon" : null,
    stalled: Number.isInteger(stalled) && stalled > 0 ? stalled : null,
    sort: findKey(SORT_PARAM, p.get("ordem")) ?? "manual",
  };
}

/** A query string com os filtros, mantendo os outros parâmetros que já estavam lá. */
export function filtersToSearch(f: BoardFilters, current = ""): string {
  const p = new URLSearchParams(current);
  for (const key of PARAMS) p.delete(key);
  if (f.q.trim()) p.set("busca", f.q);
  if (f.assignee) p.set("responsavel", f.assignee);
  if (f.priority) p.set("prioridade", PRIORITY_PARAM[f.priority]);
  if (f.label) p.set("etiqueta", f.label);
  if (f.due === "overdue") p.set("atrasadas", "1");
  if (f.due === "soon") p.set("vencendo", "1");
  if (f.stalled != null) p.set("paradas", String(f.stalled));
  if (f.sort !== "manual") p.set("ordem", SORT_PARAM[f.sort]);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Algum filtro ligado (a ordenação não conta: ela não esconde nada). */
export const hasFilters = (f: BoardFilters) =>
  f.q.trim() !== "" || f.assignee != null || f.priority != null || f.label != null || f.due != null || f.stalled != null;

/** O que os filtros precisam saber de um card, do board real ou da demonstração. */
export interface FilterableCard {
  title: string;
  assigneeSlug: string | null;
  priority: CardPriority | null;
  labelSlugs: string[];
  dueDay: string | null;
  listStatus: ListStatus;
  /** Dia em que entrou na coluna atual. */
  enteredDay: string;
}

const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Dias parado numa coluna "Em andamento"; fora dela, null. */
const stalledFor = (c: FilterableCard, day: string) => (c.listStatus === "doing" ? daysBetween(c.enteredDay, day) : null);

/** Prazo que conta: em coluna "Concluído" o prazo não alerta, como no card. */
const dueOf = (c: FilterableCard, day: string) => (c.listStatus === "done" ? null : dueRisk(c.dueDay, day));

export function matchesFilters(c: FilterableCard, f: BoardFilters, day: string): boolean {
  if (f.q.trim() && !fold(c.title).includes(fold(f.q.trim()))) return false;
  if (f.assignee && c.assigneeSlug !== f.assignee) return false;
  if (f.priority && c.priority !== f.priority) return false;
  if (f.label && !c.labelSlugs.includes(f.label)) return false;
  if (f.due && dueOf(c, day) !== f.due) return false;
  if (f.stalled != null && !((stalledFor(c, day) ?? 0) > f.stalled)) return false;
  return true;
}

const priorityRank = (c: FilterableCard) => (c.priority ? PRIORITIES.indexOf(c.priority) : PRIORITIES.length);

/**
 * Ordena uma coluna. "manual" mantém a ordem recebida; os outros desempatam pela ordem recebida
 * (sort estável). Prazo: o mais próximo primeiro, sem prazo por último. Parada: há mais tempo primeiro.
 */
export function sortCards<T>(items: T[], sort: BoardSort, get: (item: T) => FilterableCard, day: string): T[] {
  if (sort === "manual") return items;
  const key: Record<Exclude<BoardSort, "manual">, (c: FilterableCard) => number | string> = {
    priority: priorityRank,
    due: (c) => c.dueDay ?? "9999-99-99",
    stalled: (c) => -(stalledFor(c, day) ?? -1),
  };
  const k = key[sort];
  return [...items].sort((a, b) => {
    const ka = k(get(a)), kb = k(get(b));
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}
