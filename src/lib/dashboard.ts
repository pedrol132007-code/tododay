// Cálculos do dashboard a partir de um DashboardData (hoje só a demonstração; no futuro, a fonte
// real). Funções puras: nada de React nem Supabase aqui.
import type { DashboardData, DashboardPerson, DashboardWeek } from "../types";

export interface WeekPoint {
  weekStart: string;
  created: number;
  delivered: number;
  inProgress: number;
  cycleDaysTotal: number;
  withDue: number;
  onTime: number;
  /** Dias médios até concluir; null sem entregas. */
  avgCycleDays: number | null;
  /** 0–1; null sem entregas com prazo. */
  onTimeRate: number | null;
}

export interface PeriodSummary {
  created: number;
  delivered: number;
  /** Criados − concluídos: positivo = backlog crescendo. */
  balance: number;
  avgCycleDays: number | null;
  onTimeRate: number | null;
  /** Em andamento na última semana do período. */
  endInProgress: number;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

/** As `count` semanas mais recentes; `offset` 1 = as `count` anteriores a essas, e assim por diante. */
export function periodWeeks(data: DashboardData, count: number, offset = 0): string[] {
  const end = data.weeks.length - offset * count;
  if (end <= 0) return [];
  return data.weeks.slice(Math.max(0, end - count), end);
}

function point(weekStart: string, rows: DashboardWeek[]): WeekPoint {
  const p = { weekStart, created: 0, delivered: 0, inProgress: 0, cycleDaysTotal: 0, withDue: 0, onTime: 0 };
  for (const r of rows) {
    p.created += r.created;
    p.delivered += r.delivered;
    p.inProgress += r.inProgress;
    p.cycleDaysTotal += r.cycleDaysTotal;
    p.withDue += r.withDue;
    p.onTime += r.onTime;
  }
  return { ...p, avgCycleDays: ratio(p.cycleDaysTotal, p.delivered), onTimeRate: ratio(p.onTime, p.withDue) };
}

/** Uma entrada por semana pedida: a equipe somada ou, com `personId`, só a pessoa. */
export function weeklySeries(data: DashboardData, weeks: string[], personId?: string): WeekPoint[] {
  const byWeek = new Map<string, DashboardWeek[]>(weeks.map((w) => [w, []]));
  for (const r of data.rows) {
    if (personId && r.personId !== personId) continue;
    byWeek.get(r.weekStart)?.push(r);
  }
  return weeks.map((w) => point(w, byWeek.get(w)!));
}

/** Média por pessoa (referência cinza na visão de um membro). Taxas ficam as da equipe. */
export function teamAverageSeries(data: DashboardData, weeks: string[]): WeekPoint[] {
  const n = Math.max(1, data.people.length);
  return weeklySeries(data, weeks).map((p) => ({
    ...p,
    created: p.created / n,
    delivered: p.delivered / n,
    inProgress: p.inProgress / n,
  }));
}

export function summary(series: WeekPoint[]): PeriodSummary {
  let created = 0, delivered = 0, cycle = 0, withDue = 0, onTime = 0;
  for (const p of series) {
    created += p.created;
    delivered += p.delivered;
    cycle += p.cycleDaysTotal;
    withDue += p.withDue;
    onTime += p.onTime;
  }
  return {
    created,
    delivered,
    balance: created - delivered,
    avgCycleDays: ratio(cycle, delivered),
    onTimeRate: ratio(onTime, withDue),
    endInProgress: series.length ? series[series.length - 1].inProgress : 0,
  };
}

/** Variação relativa (0.2 = +20%); null quando não há base para comparar. */
export function compare(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return (current - previous) / previous;
}

export interface PersonScore {
  person: DashboardPerson;
  delivered: number;
  /** Em andamento no fim do período. */
  inProgress: number;
  avgCycleDays: number | null;
  onTimeRate: number | null;
  /** Entregas de cada semana do período (minigráfico). */
  weekly: number[];
  /** Bem pior que a equipe: em andamento ou tempo médio acima de 1,3×; no prazo 10 pts abaixo. */
  flags: { inProgress: boolean; avgCycleDays: boolean; onTimeRate: boolean };
}

const WORSE_FACTOR = 1.3;
const ON_TIME_GAP = 0.1;

/** Placar por pessoa no período, quem mais entregou primeiro. */
export function perPerson(data: DashboardData, weeks: string[]): PersonScore[] {
  const team = summary(weeklySeries(data, weeks));
  const rows = data.people.map((person) => {
    const series = weeklySeries(data, weeks, person.id);
    const s = summary(series);
    return { person, s, weekly: series.map((p) => p.delivered) };
  });
  const meanInProgress = rows.reduce((acc, r) => acc + r.s.endInProgress, 0) / Math.max(1, rows.length);
  return rows
    .map(({ person, s, weekly }) => ({
      person,
      delivered: s.delivered,
      inProgress: s.endInProgress,
      avgCycleDays: s.avgCycleDays,
      onTimeRate: s.onTimeRate,
      weekly,
      flags: {
        inProgress: meanInProgress > 0 && s.endInProgress > meanInProgress * WORSE_FACTOR,
        avgCycleDays: s.avgCycleDays != null && team.avgCycleDays != null && s.avgCycleDays > team.avgCycleDays * WORSE_FACTOR,
        onTimeRate: s.onTimeRate != null && team.onTimeRate != null && s.onTimeRate < team.onTimeRate - ON_TIME_GAP,
      },
    }))
    .sort((a, b) => b.delivered - a.delivered);
}
