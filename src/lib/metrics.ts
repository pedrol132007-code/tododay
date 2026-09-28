// Métricas do dashboard a partir das tarefas (docs/superpowers/specs/2026-09-28-dashboard-gestor-design.md).
// Funções puras: nada de React nem Supabase aqui. Dias são "AAAA-MM-DD" e períodos são inclusivos.
import type { DashboardPerson, DashboardStatus, DashboardTask } from "../types";

export interface DayRange {
  start: string;
  end: string;
}

const DAY_MS = 86_400_000;

const toDayNumber = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};
const fromDayNumber = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

export const addDays = (day: string, n: number) => fromDayNumber(toDayNumber(day) + n);
export const daysBetween = (from: string, to: string) => toDayNumber(to) - toDayNumber(from);
export const rangeLength = (r: DayRange) => daysBetween(r.start, r.end) + 1;

export type PeriodPreset = "7d" | "30d" | "12w" | "6m";

export const PERIOD_PRESETS: { id: PeriodPreset; label: string; days: number }[] = [
  { id: "7d", label: "Últimos 7 dias", days: 7 },
  { id: "30d", label: "Últimos 30 dias", days: 30 },
  { id: "12w", label: "Últimas 12 semanas", days: 84 },
  { id: "6m", label: "Últimos 6 meses", days: 182 },
];

/** Atalho de período terminando em `today`. */
export function presetRange(preset: PeriodPreset, today: string): DayRange {
  const { days } = PERIOD_PRESETS.find((p) => p.id === preset)!;
  return { start: addDays(today, -(days - 1)), end: today };
}

/** Mesmo número de dias, terminando logo antes de `r` (base das comparações). */
export function previousRange(r: DayRange): DayRange {
  return { start: addDays(r.start, -rangeLength(r)), end: addDays(r.start, -1) };
}

/** Agrupamento dos gráficos: até 31 dias, um por dia; acima, blocos de 7 contados do fim. */
export function buckets(r: DayRange): DayRange[] {
  const out: DayRange[] = [];
  const size = rangeLength(r) <= 31 ? 1 : 7;
  for (let end = r.end; daysBetween(r.start, end) >= 0; end = addDays(end, -size)) {
    const start = addDays(end, -(size - 1));
    out.unshift({ start: daysBetween(r.start, start) < 0 ? r.start : start, end });
  }
  return out;
}

/** Status no fim de `day`; null antes da criação. */
export function statusOn(task: DashboardTask, day: string): DashboardStatus | null {
  let status: DashboardStatus | null = null;
  for (const change of task.history) {
    if (change.day > day) break;
    status = change.to;
  }
  return status;
}

/** Dia da conclusão (done é final), ou null se continua aberta. */
export function completedDay(task: DashboardTask): string | null {
  const last = task.history[task.history.length - 1];
  return last.to === "done" ? last.day : null;
}

/** Posto mais próximo: pelo menos a fração `p` dos valores fica até o resultado. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface PeriodMetrics {
  created: number;
  delivered: number;
  /** Criadas − entregues: positivo = backlog cresceu. */
  backlogChange: number;
  /** Dias da criação à conclusão das entregues no período. */
  cycleP85: number | null;
  cycleMedian: number | null;
  /** Entregues no período que tinham prazo. */
  withDue: number;
  /** 0–1; null sem entregas com prazo. */
  onTimeRate: number | null;
  /** Abertas (planejadas + em andamento) no último dia. */
  openAtEnd: number;
  inProgressAtEnd: number;
}

const within = (day: string, r: DayRange) => day >= r.start && day <= r.end;

export function periodMetrics(tasks: DashboardTask[], r: DayRange): PeriodMetrics {
  let created = 0, withDue = 0, onTime = 0, openAtEnd = 0, inProgressAtEnd = 0;
  const cycles: number[] = [];
  for (const t of tasks) {
    if (within(t.createdDay, r)) created++;
    const done = completedDay(t);
    if (done && within(done, r)) {
      cycles.push(daysBetween(t.createdDay, done));
      if (t.dueDay) {
        withDue++;
        if (done <= t.dueDay) onTime++;
      }
    }
    const status = statusOn(t, r.end);
    if (status === "planned" || status === "in_progress") openAtEnd++;
    if (status === "in_progress") inProgressAtEnd++;
  }
  return {
    created,
    delivered: cycles.length,
    backlogChange: created - cycles.length,
    cycleP85: percentile(cycles, 0.85),
    cycleMedian: median(cycles),
    withDue,
    onTimeRate: withDue > 0 ? onTime / withDue : null,
    openAtEnd,
    inProgressAtEnd,
  };
}

export interface BucketMetrics extends PeriodMetrics {
  range: DayRange;
}

export function seriesByBucket(tasks: DashboardTask[], r: DayRange): BucketMetrics[] {
  return buckets(r).map((range) => ({ range, ...periodMetrics(tasks, range) }));
}

/** Média por pessoa (referência cinza na visão de um membro). Contagens divididas; taxas ficam as da equipe. */
export function teamAverageSeries(tasks: DashboardTask[], r: DayRange, people: number): BucketMetrics[] {
  const n = Math.max(1, people);
  return seriesByBucket(tasks, r).map((p) => ({
    ...p,
    created: p.created / n,
    delivered: p.delivered / n,
    backlogChange: p.backlogChange / n,
    openAtEnd: p.openAtEnd / n,
    inProgressAtEnd: p.inProgressAtEnd / n,
  }));
}

export interface PersonScore {
  person: DashboardPerson;
  delivered: number;
  /** Em andamento no fim do período. */
  inProgress: number;
  cycleP85: number | null;
  onTimeRate: number | null;
  /** Entregas de cada bloco do período (minigráfico). */
  trend: number[];
  /** Bem pior que a equipe: em andamento ou tempo acima de 1,3×; no prazo 10 pts abaixo. */
  flags: { inProgress: boolean; cycleP85: boolean; onTimeRate: boolean };
}

const WORSE_FACTOR = 1.3;
const ON_TIME_GAP = 0.1;

export function perPerson(people: DashboardPerson[], tasks: DashboardTask[], r: DayRange): PersonScore[] {
  const team = periodMetrics(tasks, r);
  const rows = people.map((person) => {
    const own = tasks.filter((t) => t.assigneeId === person.id);
    return { person, m: periodMetrics(own, r), trend: seriesByBucket(own, r).map((p) => p.delivered) };
  });
  const meanInProgress = rows.reduce((acc, row) => acc + row.m.inProgressAtEnd, 0) / Math.max(1, rows.length);
  return rows.map(({ person, m, trend }) => ({
    person,
    delivered: m.delivered,
    inProgress: m.inProgressAtEnd,
    cycleP85: m.cycleP85,
    onTimeRate: m.onTimeRate,
    trend,
    flags: {
      inProgress: meanInProgress > 0 && m.inProgressAtEnd > meanInProgress * WORSE_FACTOR,
      cycleP85: m.cycleP85 != null && team.cycleP85 != null && m.cycleP85 > team.cycleP85 * WORSE_FACTOR,
      onTimeRate: m.onTimeRate != null && team.onTimeRate != null && m.onTimeRate < team.onTimeRate - ON_TIME_GAP,
    },
  }));
}

export type Tone = "good" | "bad" | "neutral";

/** A cor diz se a mudança é boa ou ruim, não para onde ela aponta. */
export function tone(current: number | null, previous: number | null, better: "up" | "down"): Tone {
  if (current == null || previous == null || current === previous) return "neutral";
  return (current > previous) === (better === "up") ? "good" : "bad";
}

/** Variação relativa (0.2 = +20%); null quando não há base para comparar. */
export function compare(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return (current - previous) / previous;
}
