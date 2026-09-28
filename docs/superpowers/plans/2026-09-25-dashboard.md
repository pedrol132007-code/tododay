# Dashboard de desempenho — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Dashboard view with team and per-member performance over time, filled by a "Gerar demonstração" button with seeded random data kept only in memory.

**Architecture:** Pure functions turn a `DashboardData` value into weekly series and summaries (`src/lib/dashboard.ts`); a seeded generator produces demo `DashboardData` (`src/lib/demoData.ts`). Small in-house SVG/HTML chart components render the series using theme tokens. `DashboardView` owns the demo state and is lazy-loaded from `App.tsx`.

**Tech Stack:** React 18 + TypeScript, Tailwind (CSS-variable tokens), Vitest, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-25-dashboard-design.md`

## Global Constraints

- No database changes; demo data never leaves `DashboardView` state.
- Demo people are fictional: Ana Souza, Bruno Lima, Carla Dias, Diego Rocha, Elisa Prado.
- Periods: 4, 12 or 26 weeks; default 12. Demo covers 52 weeks ending at the current week.
- Chart colors only via tokens `chart-1` (#2538FF / #5B6CFF), `chart-2` (#D9730D), `chart-ref` (#6B7280); text in `text-primary`/`text-muted`, never the series color.
- One y-axis per chart; "Prazo e agilidade" is two small charts.
- Every chart has a legend when it has 2+ series and a "Ver tabela" toggle.
- Division by zero shows "—", never `NaN`.
- Copy in Portuguese, matching the rest of the app.

## Review Focus

- Period longer than the data available (e.g. 26 weeks but only 30 generated): previous-period comparison must show "—", not a wrong percentage → `compare` returns `null` when the previous total is 0 (Task 1 test).
- A member with zero deliveries in the period (vacation weeks): average cycle time and on-time rate show "—" → `summary` returns `null` rates (Task 1 test).
- Chart rendered before its container has a width (first paint, hidden tab): must not draw NaN paths → charts render nothing while `width === 0` (Task 3 code).
- Line end labels of two series ending at nearly the same value overlap → nudge labels at least 12px apart (Task 3 code, checked by screenshot in Task 5).
- Week boundaries across timezones: week starts must be Mondays in local time → `generateDemoData` test asserts `getDay() === 1` (Task 2 test).

---

### Task 1: Types and dashboard calculations

**Files:**
- Modify: `src/types/index.ts` (append)
- Create: `src/lib/dashboard.ts`, `src/lib/dashboard.test.ts`
- Create: `src/lib/chartScale.ts`, `src/lib/chartScale.test.ts`

**Interfaces:**
- Produces: `DashboardPerson`, `DashboardWeek`, `DashboardData` (types); `periodWeeks(data, count, offset?)`, `weeklySeries(data, weeks, personId?)`, `teamAverageSeries(data, weeks)`, `summary(series)`, `compare(current, previous)`, `perPerson(data, weeks)`, `WeekPoint`, `PeriodSummary`; `niceMax(max)`, `ticks(max, count?)`, `labelStep(count, width, minGap?)`.

- [ ] **Step 1: Append the types to `src/types/index.ts`**

```ts
/** Dashboard (docs/superpowers/specs/2026-09-25-dashboard-design.md). Hoje só a demonstração gera. */
export interface DashboardPerson {
  id: string;
  name: string;
}

export interface DashboardWeek {
  personId: string;
  /** "AAAA-MM-DD", segunda-feira. */
  weekStart: string;
  created: number;
  delivered: number;
  /** Em andamento no fim da semana. */
  inProgress: number;
  /** Soma dos dias até concluir, dos entregues na semana (para a média). */
  cycleDaysTotal: number;
  /** Entregues que tinham prazo. */
  withDue: number;
  /** Desses, entregues até o prazo. */
  onTime: number;
}

export interface DashboardData {
  people: DashboardPerson[];
  /** Semanas em ordem, a mais antiga primeiro. */
  weeks: string[];
  /** Uma linha por pessoa por semana. */
  rows: DashboardWeek[];
  isDemo: boolean;
}
```

- [ ] **Step 2: Write the failing tests `src/lib/dashboard.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import type { DashboardData, DashboardWeek } from "../types";
import { compare, perPerson, periodWeeks, summary, teamAverageSeries, weeklySeries } from "./dashboard";

const row = (personId: string, weekStart: string, r: Partial<DashboardWeek>): DashboardWeek => ({
  personId, weekStart, created: 0, delivered: 0, inProgress: 0, cycleDaysTotal: 0, withDue: 0, onTime: 0, ...r,
});

const data: DashboardData = {
  isDemo: true,
  people: [{ id: "a", name: "Ana" }, { id: "b", name: "Bruno" }],
  weeks: ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"],
  rows: [
    row("a", "2026-08-31", { created: 2, delivered: 1, inProgress: 3, cycleDaysTotal: 4, withDue: 1, onTime: 1 }),
    row("b", "2026-08-31", { created: 1, delivered: 1, inProgress: 1, cycleDaysTotal: 2, withDue: 1, onTime: 0 }),
    row("a", "2026-09-07", { created: 3, delivered: 4, inProgress: 2, cycleDaysTotal: 12, withDue: 2, onTime: 2 }),
    row("b", "2026-09-07", { created: 2, delivered: 0, inProgress: 3 }),
    row("a", "2026-09-14", { created: 1, delivered: 2, inProgress: 1, cycleDaysTotal: 6, withDue: 2, onTime: 1 }),
    row("b", "2026-09-14", { created: 2, delivered: 3, inProgress: 2, cycleDaysTotal: 9, withDue: 3, onTime: 3 }),
    row("a", "2026-09-21", { created: 2, delivered: 2, inProgress: 1, cycleDaysTotal: 4, withDue: 0, onTime: 0 }),
    row("b", "2026-09-21", { created: 0, delivered: 1, inProgress: 1, cycleDaysTotal: 5, withDue: 1, onTime: 1 }),
  ],
};

describe("periodWeeks", () => {
  it("takes the last N weeks", () => {
    expect(periodWeeks(data, 2)).toEqual(["2026-09-14", "2026-09-21"]);
  });
  it("takes the N weeks before that with offset 1", () => {
    expect(periodWeeks(data, 2, 1)).toEqual(["2026-08-31", "2026-09-07"]);
  });
  it("returns what exists when the data is shorter than the period", () => {
    expect(periodWeeks(data, 3, 1)).toEqual(["2026-08-31"]);
    expect(periodWeeks(data, 4, 1)).toEqual([]);
  });
});

describe("weeklySeries", () => {
  it("sums the whole team per week", () => {
    const s = weeklySeries(data, ["2026-09-14"]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ weekStart: "2026-09-14", created: 3, delivered: 5, inProgress: 3, avgCycleDays: 3, onTimeRate: 0.8 });
  });
  it("filters one person", () => {
    const s = weeklySeries(data, ["2026-09-07"], "a");
    expect(s[0]).toMatchObject({ created: 3, delivered: 4, avgCycleDays: 3, onTimeRate: 1 });
  });
  it("uses null rates when nothing was delivered or nothing had a due date", () => {
    const s = weeklySeries(data, ["2026-09-07", "2026-09-21"], "b");
    expect(s[0].avgCycleDays).toBeNull();
    expect(s[0].onTimeRate).toBeNull();
    expect(s[1].onTimeRate).toBe(1);
  });
});

describe("teamAverageSeries", () => {
  it("divides counts by the number of people and keeps rates", () => {
    const s = teamAverageSeries(data, ["2026-09-14"]);
    expect(s[0]).toMatchObject({ created: 1.5, delivered: 2.5, inProgress: 1.5, avgCycleDays: 3, onTimeRate: 0.8 });
  });
});

describe("summary", () => {
  it("totals the period and weights the averages by volume", () => {
    const s = summary(weeklySeries(data, periodWeeks(data, 2)));
    expect(s).toEqual({ created: 5, delivered: 8, balance: -3, avgCycleDays: 3, onTimeRate: 5 / 6, endInProgress: 2 });
  });
  it("returns null rates for a period with no deliveries", () => {
    const s = summary(weeklySeries(data, ["2026-09-07"], "b"));
    expect(s.avgCycleDays).toBeNull();
    expect(s.onTimeRate).toBeNull();
  });
  it("handles an empty period", () => {
    expect(summary([])).toEqual({ created: 0, delivered: 0, balance: 0, avgCycleDays: null, onTimeRate: null, endInProgress: 0 });
  });
});

describe("compare", () => {
  it("gives the relative change", () => {
    expect(compare(12, 10)).toBeCloseTo(0.2);
    expect(compare(5, 10)).toBeCloseTo(-0.5);
  });
  it("is null without a usable previous value", () => {
    expect(compare(5, 0)).toBeNull();
    expect(compare(5, null)).toBeNull();
    expect(compare(null, 3)).toBeNull();
  });
});

describe("perPerson", () => {
  it("lists deliveries in the period and work in progress at its end, most deliveries first", () => {
    expect(perPerson(data, periodWeeks(data, 2))).toEqual([
      { person: { id: "a", name: "Ana" }, delivered: 4, inProgress: 1 },
      { person: { id: "b", name: "Bruno" }, delivered: 4, inProgress: 1 },
    ]);
    expect(perPerson(data, periodWeeks(data, 2, 1))[0].person.id).toBe("a");
  });
});
```

- [ ] **Step 3: Write the failing tests `src/lib/chartScale.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { labelStep, niceMax, ticks } from "./chartScale";

describe("niceMax", () => {
  it("rounds up to a readable axis maximum", () => {
    expect(niceMax(7)).toBe(10);
    expect(niceMax(23)).toBe(25);
    expect(niceMax(0.87)).toBe(1);
    expect(niceMax(100)).toBe(100);
    expect(niceMax(130)).toBe(200);
  });
  it("never returns zero", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-3)).toBe(1);
  });
});

describe("ticks", () => {
  it("splits the axis evenly from zero", () => {
    expect(ticks(20, 4)).toEqual([0, 5, 10, 15, 20]);
  });
});

describe("labelStep", () => {
  it("shows every label when there is room", () => {
    expect(labelStep(4, 400)).toBe(1);
  });
  it("skips labels so they stay at least ~56px apart", () => {
    expect(labelStep(26, 400)).toBe(4);
    expect(labelStep(12, 0)).toBe(12);
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `npx vitest run src/lib/dashboard.test.ts src/lib/chartScale.test.ts`
Expected: FAIL — "Failed to load url ./dashboard" and "./chartScale".

- [ ] **Step 5: Implement `src/lib/chartScale.ts`**

```ts
// Escalas dos gráficos do dashboard: máximo "redondo" do eixo, marcações e espaçamento de rótulos.

const NICE = [1, 2, 2.5, 5, 10];

export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / exp;
  return (NICE.find((n) => f <= n) ?? 10) * exp;
}

export function ticks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => (max / count) * i);
}

/** De quantos em quantos rótulos do eixo X mostrar para caberem em `width` px. */
export function labelStep(count: number, width: number, minGap = 56): number {
  const fit = Math.max(1, Math.floor(width / minGap));
  return Math.max(1, Math.ceil(count / fit));
}
```

- [ ] **Step 6: Implement `src/lib/dashboard.ts`**

```ts
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

export function perPerson(
  data: DashboardData,
  weeks: string[],
): { person: DashboardPerson; delivered: number; inProgress: number }[] {
  return data.people
    .map((person) => {
      const s = summary(weeklySeries(data, weeks, person.id));
      return { person, delivered: s.delivered, inProgress: s.endInProgress };
    })
    .sort((a, b) => b.delivered - a.delivered);
}
```

- [ ] **Step 7: Run to verify they pass**

Run: `npx vitest run src/lib/dashboard.test.ts src/lib/chartScale.test.ts`
Expected: PASS (all).

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/lib/dashboard.ts src/lib/dashboard.test.ts src/lib/chartScale.ts src/lib/chartScale.test.ts
git commit -m "Add dashboard data types and calculations"
```

---

### Task 2: Demo data generator

**Files:**
- Create: `src/lib/demoData.ts`, `src/lib/demoData.test.ts`

**Interfaces:**
- Consumes: `DashboardData`, `DashboardWeek` (Task 1).
- Produces: `generateDemoData(seed: number, options?: { weeks?: number; today?: Date }): DashboardData`, `DEMO_PEOPLE`.

- [ ] **Step 1: Write the failing tests `src/lib/demoData.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { DEMO_PEOPLE, generateDemoData } from "./demoData";

const today = new Date(2026, 8, 25); // quinta, 25/09/2026

describe("generateDemoData", () => {
  const data = generateDemoData(42, { today });

  it("is marked as a demo and uses the fictional people", () => {
    expect(data.isDemo).toBe(true);
    expect(data.people).toEqual(DEMO_PEOPLE);
    expect(data.people.map((p) => p.name)).toEqual(["Ana Souza", "Bruno Lima", "Carla Dias", "Diego Rocha", "Elisa Prado"]);
  });

  it("covers 52 consecutive weeks starting on Mondays and ending this week", () => {
    expect(data.weeks).toHaveLength(52);
    expect(data.weeks[51]).toBe("2026-09-21");
    for (let i = 0; i < data.weeks.length; i++) {
      const [y, m, d] = data.weeks[i].split("-").map(Number);
      expect(new Date(y, m - 1, d).getDay()).toBe(1);
      if (i > 0) {
        const [py, pm, pd] = data.weeks[i - 1].split("-").map(Number);
        const days = (new Date(y, m - 1, d).getTime() - new Date(py, pm - 1, pd).getTime()) / 86_400_000;
        expect(Math.round(days)).toBe(7);
      }
    }
  });

  it("has one row per person per week with consistent numbers", () => {
    expect(data.rows).toHaveLength(52 * 5);
    for (const r of data.rows) {
      for (const n of [r.created, r.delivered, r.inProgress, r.withDue, r.onTime]) {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      }
      expect(r.delivered).toBeLessThanOrEqual(14);
      expect(r.withDue).toBeLessThanOrEqual(r.delivered);
      expect(r.onTime).toBeLessThanOrEqual(r.withDue);
      if (r.delivered > 0) {
        const avg = r.cycleDaysTotal / r.delivered;
        expect(avg).toBeGreaterThanOrEqual(1);
        expect(avg).toBeLessThanOrEqual(12);
      } else {
        expect(r.cycleDaysTotal).toBe(0);
      }
    }
  });

  it("is reproducible for a seed and different across seeds", () => {
    expect(generateDemoData(42, { today })).toEqual(data);
    expect(generateDemoData(43, { today }).rows).not.toEqual(data.rows);
  });

  it("respects a custom length", () => {
    expect(generateDemoData(1, { today, weeks: 8 }).weeks).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/demoData.test.ts`
Expected: FAIL — "Failed to load url ./demoData".

- [ ] **Step 3: Implement `src/lib/demoData.ts`**

```ts
// Dados de demonstração do dashboard: aleatórios, mas reproduzíveis pela semente. Pessoas
// fictícias de propósito, para um número inventado nunca ser atribuído a um colega real.
import type { DashboardData, DashboardPerson, DashboardWeek } from "../types";

export const DEMO_PEOPLE: DashboardPerson[] = [
  { id: "demo-ana", name: "Ana Souza" },
  { id: "demo-bruno", name: "Bruno Lima" },
  { id: "demo-carla", name: "Carla Dias" },
  { id: "demo-diego", name: "Diego Rocha" },
  { id: "demo-elisa", name: "Elisa Prado" },
];

/** PRNG pequeno e determinístico (mulberry32): mesma semente, mesma sequência. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function generateDemoData(seed: number, options: { weeks?: number; today?: Date } = {}): DashboardData {
  const count = options.weeks ?? 52;
  const rand = mulberry32(seed);
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  // Soma de uniformes ≈ normal em torno de 0, amplitude ±1.5.
  const noise = () => rand() + rand() + rand() - 1.5;

  const lastMonday = mondayOf(options.today ?? new Date());
  const weeks = Array.from({ length: count }, (_, i) => {
    const d = new Date(lastMonday);
    d.setDate(d.getDate() - 7 * (count - 1 - i));
    return iso(d);
  });

  const rows: DashboardWeek[] = [];
  for (const person of DEMO_PEOPLE) {
    const capacity = between(3, 8);
    const trend = between(-0.35, 0.35); // variação total ao longo do ano
    const cycleBase = between(2, 9);
    const onTimeBase = between(0.6, 0.95);
    const phase = rand() * Math.PI * 2;
    let inProgress = Math.round(between(2, 6));

    weeks.forEach((weekStart, i) => {
      const progress = count > 1 ? i / (count - 1) : 1;
      const onVacation = rand() < 1 / 12;
      const delivered = onVacation
        ? 0
        : clamp(Math.round(capacity * (1 + trend * (progress - 0.5)) + noise() * 1.5), 0, 14);
      // Ondas de acúmulo: em parte do ano entra mais trabalho do que sai, depois o contrário.
      const wave = Math.sin(progress * Math.PI * 3 + phase);
      const created = clamp(Math.round((onVacation ? capacity * 0.4 : delivered) * (1 + 0.3 * wave) + noise()), 0, 16);
      inProgress = clamp(inProgress + created - delivered, 0, 15);

      let cycleDaysTotal = 0;
      for (let k = 0; k < delivered; k++) cycleDaysTotal += clamp(cycleBase + noise() * 2, 1, 12);
      const withDue = Math.round(delivered * between(0.6, 0.9));
      const onTime = Math.round(withDue * clamp(onTimeBase + noise() * 0.1, 0, 1));

      rows.push({
        personId: person.id,
        weekStart,
        created,
        delivered,
        inProgress,
        cycleDaysTotal: Math.round(cycleDaysTotal * 10) / 10,
        withDue,
        onTime,
      });
    });
  }

  return { people: DEMO_PEOPLE, weeks, rows, isDemo: true };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/demoData.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demoData.ts src/lib/demoData.test.ts
git commit -m "Add seeded demo data generator for the dashboard"
```

---

### Task 3: Chart tokens and chart components

**Files:**
- Modify: `src/index.css` (tokens in `:root` and `.dark`), `tailwind.config.ts` (colors)
- Create: `src/components/dashboard/charts/useElementWidth.ts`, `ChartFrame.tsx`, `LineChart.tsx`, `ColumnChart.tsx`, `HBarChart.tsx`, `StatTile.tsx`, `colors.ts`

**Interfaces:**
- Consumes: `niceMax`, `ticks`, `labelStep` (Task 1).
- Produces:
  - `type ChartColor = "chart-1" | "chart-2" | "chart-ref"`; `STROKE`, `FILL`, `BG` class maps.
  - `<ChartFrame title legend? table>{chart}</ChartFrame>` with `legend: { label: string; color: ChartColor; dashed?: boolean }[]`, `table: { columns: string[]; rows: (string | number)[][] }`.
  - `<LineChart labels series format ariaLabel height? />`, `series: { name: string; values: (number | null)[]; color: ChartColor; dashed?: boolean }[]`.
  - `<ColumnChart labels values name format ariaLabel reference? referenceName? height? />`.
  - `<HBarChart rows aLabel bLabel />`, `rows: { id: string; name: string; a: number; b: number }[]`.
  - `<StatTile label value delta? spark? />`, `delta: string | null`, `spark: number[]`.

- [ ] **Step 1: Add tokens to `src/index.css`** — inside `:root` after `--border`:

```css
    --chart-1: 37 56 255; /* = primary; validado com a skill dataviz */
    --chart-2: 217 115 13; /* #D9730D: o laranja da marca é claro demais para gráfico */
    --chart-ref: 107 114 128; /* #6B7280: média da equipe */
```

and inside `.dark` after `--border`:

```css
    --chart-1: 91 108 255;
    --chart-2: 217 115 13;
    --chart-ref: 107 114 128;
```

- [ ] **Step 2: Add colors to `tailwind.config.ts`** after `border: token("border"),`:

```ts
        "chart-1": token("chart-1"),
        "chart-2": token("chart-2"),
        "chart-ref": token("chart-ref"),
```

- [ ] **Step 3: Create `src/components/dashboard/charts/colors.ts`**

```ts
// Classes completas por cor (o Tailwind só gera classes que aparecem escritas no código).
export type ChartColor = "chart-1" | "chart-2" | "chart-ref";

export const STROKE: Record<ChartColor, string> = {
  "chart-1": "stroke-chart-1",
  "chart-2": "stroke-chart-2",
  "chart-ref": "stroke-chart-ref",
};

export const FILL: Record<ChartColor, string> = {
  "chart-1": "fill-chart-1",
  "chart-2": "fill-chart-2",
  "chart-ref": "fill-chart-ref",
};

export const BG: Record<ChartColor, string> = {
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-ref": "bg-chart-ref",
};
```

- [ ] **Step 4: Create `src/components/dashboard/charts/useElementWidth.ts`**

```ts
import { useEffect, useRef, useState } from "react";

/** Largura atual do elemento em px (0 até a primeira medição): os gráficos desenham em px reais. */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
```

- [ ] **Step 5: Create `src/components/dashboard/charts/ChartFrame.tsx`**

```tsx
import { useState, type ReactNode } from "react";
import { STROKE, type ChartColor } from "./colors";

export interface LegendItem {
  label: string;
  color: ChartColor;
  dashed?: boolean;
}

/** Moldura dos gráficos: título, legenda e alternância para ver os mesmos números em tabela. */
export function ChartFrame({
  title,
  legend,
  table,
  children,
}: {
  title: string;
  legend?: LegendItem[];
  table: { columns: string[]; rows: (string | number)[][] };
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-bg-surface p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {legend && legend.length > 1 && (
          <ul className="flex flex-wrap gap-3 text-xs text-text-muted">
            {legend.map((item) => (
              <li key={item.label} className="inline-flex items-center gap-1.5">
                <svg width="16" height="6" aria-hidden="true">
                  <line x1="0" y1="3" x2="16" y2="3" strokeWidth="2" className={STROKE[item.color]} strokeDasharray={item.dashed ? "3 3" : undefined} />
                </svg>
                {item.label}
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => setAsTable((v) => !v)} className="ml-auto text-xs text-text-muted hover:text-primary">
          {asTable ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>
      {asTable ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-bg-surface text-text-muted">
              <tr>
                {table.columns.map((c) => (
                  <th key={c} className="py-1 pr-3 font-medium">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-text-primary">
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  {r.map((cell, j) => (
                    <td key={j} className="py-1 pr-3 tabular-nums">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
```

- [ ] **Step 6: Create `src/components/dashboard/charts/LineChart.tsx`**

```tsx
import { useState } from "react";
import { labelStep, niceMax, ticks } from "../../../lib/chartScale";
import { BG, FILL, STROKE, type ChartColor } from "./colors";
import { useElementWidth } from "./useElementWidth";

export interface LineSeries {
  name: string;
  values: (number | null)[];
  color: ChartColor;
  dashed?: boolean;
}

const PAD = { l: 40, r: 72, t: 12, b: 24 };

/** Linhas ao longo das semanas, com linha guia e dica no hover e rótulo no fim de cada série. */
export function LineChart({
  labels,
  series,
  format,
  ariaLabel,
  height = 200,
}: {
  labels: string[];
  series: LineSeries[];
  format: (v: number) => string;
  ariaLabel: string;
  height?: number;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const w = Math.max(0, width - PAD.l - PAD.r);
  const h = height - PAD.t - PAD.b;
  const values = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const max = niceMax(Math.max(0, ...values));
  const x = (i: number) => PAD.l + (labels.length <= 1 ? w / 2 : (i * w) / (labels.length - 1));
  const y = (v: number) => PAD.t + h - (v / max) * h;
  const step = labelStep(labels.length, w);

  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  // Rótulo no fim de cada linha, afastando os que ficariam a menos de 12px um do outro.
  const ends = series
    .map((s) => {
      const i = s.values.findLastIndex((v) => v != null);
      return i < 0 ? null : { name: s.name, y: y(s.values[i]!) };
    })
    .filter((e): e is { name: string; y: number } => e != null)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const mx = e.clientX - e.currentTarget.getBoundingClientRect().left;
    if (labels.length === 0 || w === 0) return;
    const i = Math.round(((mx - PAD.l) / w) * (labels.length - 1));
    setHover(Math.min(labels.length - 1, Math.max(0, i)));
  }

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
          {ticks(max).map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={PAD.l + w} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
              <text x={PAD.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-text-muted text-[10px]">
                {format(t)}
              </text>
            </g>
          ))}
          {labels.map((label, i) =>
            i % step === 0 ? (
              <text key={i} x={x(i)} y={height - 6} textAnchor="middle" className="fill-text-muted text-[10px]">
                {label}
              </text>
            ) : null,
          )}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + h} className="stroke-text-muted" strokeWidth={1} />}
          {series.map((s) => (
            <path
              key={s.name}
              d={path(s.values)}
              fill="none"
              className={STROKE[s.color]}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? "4 4" : undefined}
            />
          ))}
          {hover != null &&
            series.map((s) =>
              s.values[hover] != null ? (
                <circle key={s.name} cx={x(hover)} cy={y(s.values[hover]!)} r={4} className={`${FILL[s.color]} stroke-bg-surface`} strokeWidth={2} />
              ) : null,
            )}
          {ends.map((e) => (
            <text key={e.name} x={PAD.l + w + 6} y={e.y} dominantBaseline="middle" className="fill-text-primary text-[11px]">
              {e.name}
            </text>
          ))}
        </svg>
      )}
      {hover != null && width > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-lg border border-border bg-bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(0, x(hover) + 10), width - 150) }}
        >
          <p className="mb-1 font-semibold text-text-primary">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center gap-2 text-text-muted">
              <span className={`h-2 w-2 rounded-full ${BG[s.color]}`} />
              {s.name}
              <span className="ml-auto pl-3 tabular-nums text-text-primary">{s.values[hover] == null ? "—" : format(s.values[hover]!)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Create `src/components/dashboard/charts/ColumnChart.tsx`**

```tsx
import { useState } from "react";
import { labelStep, niceMax, ticks } from "../../../lib/chartScale";
import { BG, STROKE } from "./colors";
import { useElementWidth } from "./useElementWidth";

const PAD = { l: 40, r: 12, t: 12, b: 24 };

/** Colunas com topo arredondado; `reference` desenha a média da equipe tracejada por cima. */
function barPath(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function ColumnChart({
  labels,
  values,
  name,
  format,
  ariaLabel,
  reference,
  referenceName,
  height = 200,
}: {
  labels: string[];
  values: number[];
  name: string;
  format: (v: number) => string;
  ariaLabel: string;
  reference?: (number | null)[];
  referenceName?: string;
  height?: number;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const w = Math.max(0, width - PAD.l - PAD.r);
  const h = height - PAD.t - PAD.b;
  const all = [...values, ...(reference ?? []).filter((v): v is number => v != null)];
  const max = niceMax(Math.max(0, ...all));
  const band = labels.length ? w / labels.length : 0;
  const barW = Math.max(2, Math.min(28, band - 2));
  const cx = (i: number) => PAD.l + band * i + band / 2;
  const y = (v: number) => PAD.t + h - (v / max) * h;
  const step = labelStep(labels.length, w);
  const refPath = reference
    ?.map((v, i) => (v == null ? "" : `${i === 0 || reference[i - 1] == null ? "M" : "L"}${cx(i).toFixed(1)},${y(v).toFixed(1)}`))
    .join("");

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
          {ticks(max).map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={PAD.l + w} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
              <text x={PAD.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-text-muted text-[10px]">
                {format(t)}
              </text>
            </g>
          ))}
          {values.map((v, i) => (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={PAD.l + band * i} y={PAD.t} width={band} height={h} fill="transparent" />
              <path
                d={barPath(cx(i) - barW / 2, y(v), barW, PAD.t + h - y(v), 4)}
                className={`fill-chart-1 transition-opacity ${hover != null && hover !== i ? "opacity-50" : ""}`}
              />
            </g>
          ))}
          {refPath && <path d={refPath} fill="none" className={STROKE["chart-ref"]} strokeWidth={2} strokeDasharray="4 4" pointerEvents="none" />}
          {labels.map((label, i) =>
            i % step === 0 ? (
              <text key={i} x={cx(i)} y={height - 6} textAnchor="middle" className="fill-text-muted text-[10px]">
                {label}
              </text>
            ) : null,
          )}
        </svg>
      )}
      {hover != null && width > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-32 rounded-lg border border-border bg-bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(0, cx(hover) + 10), width - 150) }}
        >
          <p className="mb-1 font-semibold text-text-primary">{labels[hover]}</p>
          <p className="flex items-center gap-2 text-text-muted">
            <span className={`h-2 w-2 rounded-full ${BG["chart-1"]}`} />
            {name}
            <span className="ml-auto pl-3 tabular-nums text-text-primary">{format(values[hover])}</span>
          </p>
          {reference && referenceName && (
            <p className="flex items-center gap-2 text-text-muted">
              <span className={`h-2 w-2 rounded-full ${BG["chart-ref"]}`} />
              {referenceName}
              <span className="ml-auto pl-3 tabular-nums text-text-primary">{reference[hover] == null ? "—" : format(reference[hover]!)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Create `src/components/dashboard/charts/HBarChart.tsx`**

```tsx
import { niceMax } from "../../../lib/chartScale";
import { BG } from "./colors";

/** Barras horizontais empilhadas (a + b) por pessoa, com 2px entre os segmentos. */
export function HBarChart({ rows, aLabel, bLabel }: { rows: { id: string; name: string; a: number; b: number }[]; aLabel: string; bLabel: string }) {
  const max = niceMax(Math.max(0, ...rows.map((r) => r.a + r.b)));
  return (
    <ul className="flex flex-col gap-2.5" role="img" aria-label={`${aLabel} e ${bLabel} por pessoa`}>
      {rows.map((r) => (
        <li key={r.id} className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-3 text-sm" title={`${r.name}: ${r.a} ${aLabel.toLowerCase()}, ${r.b} ${bLabel.toLowerCase()}`}>
          <span className="truncate text-text-primary">{r.name}</span>
          <span className="flex h-3 gap-[2px]">
            {r.a > 0 && <span className={`h-full rounded-l ${r.b === 0 ? "rounded-r" : ""} ${BG["chart-1"]}`} style={{ width: `${(r.a / max) * 100}%` }} />}
            {r.b > 0 && <span className={`h-full rounded-r ${r.a === 0 ? "rounded-l" : ""} ${BG["chart-2"]}`} style={{ width: `${(r.b / max) * 100}%` }} />}
          </span>
          <span className="text-right text-xs tabular-nums text-text-muted">
            {r.a} · {r.b}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 9: Create `src/components/dashboard/charts/StatTile.tsx`**

```tsx
/** Número principal do dashboard: valor, variação escrita (nunca só cor) e minigráfico. */
export function StatTile({ label, value, delta, spark }: { label: string; value: string; delta?: string | null; spark?: number[] }) {
  const max = Math.max(1, ...(spark ?? []));
  const points = (spark ?? []).map((v, i, all) => `${all.length <= 1 ? 48 : (i * 96) / (all.length - 1)},${26 - (v / max) * 24}`).join(" ");
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-bg-surface p-5">
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</span>
      <div className="flex items-end justify-between gap-3">
        <span className="text-4xl font-normal leading-none tracking-[-0.03em] text-text-primary tabular-nums">{value}</span>
        {spark && spark.length > 1 && (
          <svg width="96" height="28" aria-hidden="true" className="shrink-0">
            <polyline points={points} fill="none" className="stroke-chart-1" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <span className="text-xs text-text-muted">{delta ?? "—"}</span>
    </div>
  );
}
```

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (`findLastIndex` needs `lib` ES2023; if tsc reports it missing, replace with a loop: `let i = s.values.length - 1; while (i >= 0 && s.values[i] == null) i--;`.)

- [ ] **Step 11: Commit**

```bash
git add src/index.css tailwind.config.ts src/components/dashboard/charts
git commit -m "Add chart tokens and in-house SVG chart components"
```

---

### Task 4: DashboardView and navigation

**Files:**
- Create: `src/components/dashboard/DashboardView.tsx`
- Modify: `src/App.tsx` (view union, header button, lazy render)

**Interfaces:**
- Consumes: everything from Tasks 1–3; `PageHeader`, `EmptyState`, `Avatar`, `memberColor`-based avatar, `formatDue` (`src/lib/boardVisuals.ts`), icons.
- Produces: `DashboardView({ teamName }: { teamName: string })` (named export).

- [ ] **Step 1: Create `src/components/dashboard/DashboardView.tsx`**

```tsx
import { useMemo, useState, type ReactNode } from "react";
import type { DashboardData } from "../../types";
import { compare, perPerson, periodWeeks, summary, teamAverageSeries, weeklySeries } from "../../lib/dashboard";
import { generateDemoData } from "../../lib/demoData";
import { formatDue } from "../../lib/boardVisuals";
import { Avatar } from "../ui/Avatar";
import { EmptyState } from "../ui/EmptyState";
import { PageHeader } from "../ui/PageHeader";
import { IconColumns } from "../ui/icons";
import { ChartFrame } from "./charts/ChartFrame";
import { ColumnChart } from "./charts/ColumnChart";
import { HBarChart } from "./charts/HBarChart";
import { LineChart } from "./charts/LineChart";
import { StatTile } from "./charts/StatTile";

const PERIODS = [4, 12, 26] as const;
type Period = (typeof PERIODS)[number];

const num = (v: number, digits = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const days = (v: number | null) => (v == null ? "—" : `${num(v, 1)} d`);
const pct = (v: number | null) => (v == null ? "—" : `${num(v * 100)}%`);

function relative(cur: number | null, prev: number | null, period: Period): string | null {
  const c = compare(cur, prev);
  if (c == null) return null;
  const arrow = c > 0.005 ? "▲" : c < -0.005 ? "▼" : "■";
  return `${arrow} ${num(Math.abs(c * 100))}% vs. ${period} semanas anteriores`;
}

function points(cur: number | null, prev: number | null, period: Period): string | null {
  if (cur == null || prev == null) return null;
  const d = (cur - prev) * 100;
  const arrow = d > 0.5 ? "▲" : d < -0.5 ? "▼" : "■";
  return `${arrow} ${num(Math.abs(d))} pts vs. ${period} semanas anteriores`;
}

function Segmented<T extends string | number>({ label, options, value, onChange, format }: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => ReactNode;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-fit rounded-xl border border-border bg-bg-elevated p-0.5">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          role="radio"
          aria-checked={o === value}
          onClick={() => onChange(o)}
          className={`rounded-lg px-3 py-1 text-sm transition-colors ${o === value ? "bg-primary text-on-accent" : "text-text-muted hover:text-text-primary"}`}
        >
          {format(o)}
        </button>
      ))}
    </div>
  );
}

export function DashboardView({ teamName }: { teamName: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [period, setPeriod] = useState<Period>(12);
  const [personId, setPersonId] = useState<string | null>(null);

  function generate() {
    setData(generateDemoData(Math.floor(Math.random() * 2 ** 31)));
  }

  function exitDemo() {
    setData(null);
    setPersonId(null);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Dashboard"
          title={
            <span className="inline-flex flex-wrap items-center gap-3">
              {teamName}
              {data?.isDemo && (
                <span className="rounded-lg bg-highlight px-2 py-1 text-xs font-semibold uppercase tracking-wider text-black">Demonstração</span>
              )}
            </span>
          }
        />
        {data && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <Segmented label="Período" options={PERIODS} value={period} onChange={setPeriod} format={(p) => `${p} sem.`} />
            <button type="button" onClick={generate} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-bg-elevated">
              Gerar de novo
            </button>
            <button type="button" onClick={exitDemo} className="rounded-lg px-3 py-1.5 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary">
              Sair da demonstração
            </button>
          </div>
        )}
      </div>

      {data ? (
        <DashboardBody data={data} period={period} personId={personId} onSelectPerson={setPersonId} />
      ) : (
        <div className="flex flex-1 items-start justify-center">
          <EmptyState
            icon={<IconColumns size={22} />}
            title="O dashboard ainda não tem dados"
            description="As métricas reais chegam com o status do card. Enquanto isso, veja como fica com dados de exemplo."
            action={
              <button type="button" onClick={generate} className="btn-primary px-4 py-2">
                Gerar demonstração
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}

function DashboardBody({ data, period, personId, onSelectPerson }: {
  data: DashboardData;
  period: Period;
  personId: string | null;
  onSelectPerson: (id: string | null) => void;
}) {
  const today = new Date();
  const person = data.people.find((p) => p.id === personId) ?? null;

  const view = useMemo(() => {
    const weeks = periodWeeks(data, period);
    const prevWeeks = periodWeeks(data, period, 1);
    const series = weeklySeries(data, weeks, personId ?? undefined);
    const sum = summary(series);
    const prev = summary(weeklySeries(data, prevWeeks, personId ?? undefined));
    const team = personId ? teamAverageSeries(data, weeks) : null;
    return { weeks, series, sum, prev, team, people: perPerson(data, weeks) };
  }, [data, period, personId]);

  const labels = view.weeks.map((w) => formatDue(w, today));
  const subject = person ? person.name.split(" ")[0] : "Equipe";
  const refName = "Média da equipe";

  return (
    <div className="flex flex-col gap-6">
      <div role="radiogroup" aria-label="Visão" className="flex flex-wrap gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={personId == null}
          onClick={() => onSelectPerson(null)}
          className={`rounded-full border px-3 py-1 text-sm ${personId == null ? "border-primary bg-primary text-on-accent" : "border-border text-text-primary hover:bg-bg-elevated"}`}
        >
          Equipe
        </button>
        {data.people.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={personId === p.id}
            onClick={() => onSelectPerson(p.id)}
            className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm ${personId === p.id ? "border-primary bg-primary/10 text-text-primary" : "border-border text-text-primary hover:bg-bg-elevated"}`}
          >
            <Avatar userId={p.id} name={p.name} />
            {p.name}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Entregas"
          value={num(view.sum.delivered)}
          delta={relative(view.sum.delivered, view.prev.delivered, period)}
          spark={view.series.map((p) => p.delivered)}
        />
        <StatTile
          label="Criados − concluídos"
          value={`${view.sum.balance > 0 ? "+" : ""}${num(view.sum.balance)}`}
          delta={view.sum.balance > 0 ? "Entrou mais trabalho do que saiu" : view.sum.balance < 0 ? "Saiu mais trabalho do que entrou" : "Equilibrado"}
        />
        <StatTile
          label="Tempo médio"
          value={days(view.sum.avgCycleDays)}
          delta={relative(view.sum.avgCycleDays, view.prev.avgCycleDays, period)}
        />
        <StatTile label="No prazo" value={pct(view.sum.onTimeRate)} delta={points(view.sum.onTimeRate, view.prev.onTimeRate, period)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartFrame
          title="Entregas por semana"
          legend={view.team ? [{ label: subject, color: "chart-1" }, { label: refName, color: "chart-ref", dashed: true }] : undefined}
          table={{
            columns: view.team ? ["Semana", subject, refName] : ["Semana", "Entregas"],
            rows: view.series.map((p, i) => (view.team ? [labels[i], p.delivered, num(view.team[i].delivered, 1)] : [labels[i], p.delivered])),
          }}
        >
          <ColumnChart
            labels={labels}
            values={view.series.map((p) => p.delivered)}
            name={subject}
            format={(v) => num(v, 1)}
            reference={view.team?.map((p) => p.delivered)}
            referenceName={refName}
            ariaLabel={`Entregas por semana de ${subject}: ${period} semanas, total ${num(view.sum.delivered)}`}
          />
        </ChartFrame>

        <ChartFrame
          title="Criados x concluídos"
          legend={[{ label: "Concluídos", color: "chart-1" }, { label: "Criados", color: "chart-2" }]}
          table={{ columns: ["Semana", "Criados", "Concluídos"], rows: view.series.map((p, i) => [labels[i], p.created, p.delivered]) }}
        >
          <LineChart
            labels={labels}
            series={[
              { name: "Concluídos", values: view.series.map((p) => p.delivered), color: "chart-1" },
              { name: "Criados", values: view.series.map((p) => p.created), color: "chart-2" },
            ]}
            format={(v) => num(v, 1)}
            ariaLabel={`Criados e concluídos por semana: ${num(view.sum.created)} criados, ${num(view.sum.delivered)} concluídos`}
          />
        </ChartFrame>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {person ? (
          <ChartFrame
            title="Carga ao longo do tempo"
            legend={[{ label: "Entregues", color: "chart-1" }, { label: "Em andamento", color: "chart-2" }]}
            table={{ columns: ["Semana", "Entregues", "Em andamento"], rows: view.series.map((p, i) => [labels[i], p.delivered, p.inProgress]) }}
          >
            <LineChart
              labels={labels}
              series={[
                { name: "Entregues", values: view.series.map((p) => p.delivered), color: "chart-1" },
                { name: "Em andamento", values: view.series.map((p) => p.inProgress), color: "chart-2" },
              ]}
              format={(v) => num(v, 1)}
              ariaLabel={`Carga de ${subject} por semana`}
            />
          </ChartFrame>
        ) : (
          <ChartFrame
            title="Por pessoa"
            legend={[{ label: "Entregues no período", color: "chart-1" }, { label: "Em andamento agora", color: "chart-2" }]}
            table={{ columns: ["Pessoa", "Entregues", "Em andamento"], rows: view.people.map((r) => [r.person.name, r.delivered, r.inProgress]) }}
          >
            <HBarChart
              rows={view.people.map((r) => ({ id: r.person.id, name: r.person.name, a: r.delivered, b: r.inProgress }))}
              aLabel="Entregues"
              bLabel="Em andamento"
            />
          </ChartFrame>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <ChartFrame
            title="Tempo médio (dias)"
            legend={view.team ? [{ label: subject, color: "chart-1" }, { label: refName, color: "chart-ref", dashed: true }] : undefined}
            table={{ columns: ["Semana", "Dias"], rows: view.series.map((p, i) => [labels[i], days(p.avgCycleDays)]) }}
          >
            <LineChart
              labels={labels}
              height={160}
              series={[
                { name: subject, values: view.series.map((p) => p.avgCycleDays), color: "chart-1" },
                ...(view.team ? [{ name: "Equipe", values: view.team.map((p) => p.avgCycleDays), color: "chart-ref" as const, dashed: true }] : []),
              ]}
              format={(v) => num(v, 1)}
              ariaLabel={`Tempo médio para concluir de ${subject}: ${days(view.sum.avgCycleDays)}`}
            />
          </ChartFrame>
          <ChartFrame
            title="No prazo (%)"
            legend={view.team ? [{ label: subject, color: "chart-1" }, { label: refName, color: "chart-ref", dashed: true }] : undefined}
            table={{ columns: ["Semana", "No prazo"], rows: view.series.map((p, i) => [labels[i], pct(p.onTimeRate)]) }}
          >
            <LineChart
              labels={labels}
              height={160}
              series={[
                { name: subject, values: view.series.map((p) => (p.onTimeRate == null ? null : p.onTimeRate * 100)), color: "chart-1" },
                ...(view.team
                  ? [{ name: "Equipe", values: view.team.map((p) => (p.onTimeRate == null ? null : p.onTimeRate * 100)), color: "chart-ref" as const, dashed: true }]
                  : []),
              ]}
              format={(v) => `${num(v)}%`}
              ariaLabel={`Entregas no prazo de ${subject}: ${pct(view.sum.onTimeRate)}`}
            />
          </ChartFrame>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `src/App.tsx`**

1. `import { Suspense, lazy, useEffect, useState } from "react";` (replace line 1).
2. After the imports:
```tsx
// Carregado só ao abrir o Dashboard: os gráficos não pesam para quem usa só o board.
const DashboardView = lazy(() => import("./components/dashboard/DashboardView").then((m) => ({ default: m.DashboardView })));
```
3. View union: `useState<"board" | "archive" | "team" | "settings" | "dashboard">("board")`.
4. Before the "Equipe" header button, add:
```tsx
        <button
          type="button"
          onClick={() => setView((v) => (v === "dashboard" ? "board" : "dashboard"))}
          className={`shrink-0 rounded-lg px-3 py-1 text-sm hover:bg-bg-elevated hover:text-text-primary ${
            view === "dashboard" ? "text-text-primary" : "text-text-muted"
          }`}
        >
          Dashboard
        </button>
```
5. In the view switch, before `view === "settings" ? (`:
```tsx
      {view === "dashboard" ? (
        <Suspense fallback={null}>
          <DashboardView teamName={team.name} />
        </Suspense>
      ) : view === "settings" ? (
```
and remove the now-duplicated opening `{` of the old chain so the ternary stays one expression.

- [ ] **Step 3: Typecheck, tests and build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: tsc exit 0; all Vitest files pass; build lists a separate `DashboardView-*.js` chunk.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/DashboardView.tsx src/App.tsx
git commit -m "Add the Dashboard view with team and member performance"
```

---

### Task 5: End-to-end test, visual check and docs

**Files:**
- Modify: `e2e/app.spec.ts` (new test), `CLAUDE.md` (one line), `README.md` (feature list)

- [ ] **Step 1: Add the Playwright test to `e2e/app.spec.ts`**

```ts
test("dashboard gera demonstração, troca período e pessoa, mostra tabela e sai", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByText("O dashboard ainda não tem dados")).toBeVisible();

  await page.getByRole("button", { name: "Gerar demonstração" }).click();
  await expect(page.getByText("Demonstração", { exact: true })).toBeVisible();
  await expect(page.getByText("Entregas por semana")).toBeVisible();

  await page.getByRole("radio", { name: "26 sem." }).click();
  await page.getByRole("radio", { name: /Carla Dias/ }).click();
  await expect(page.getByText("Carga ao longo do tempo")).toBeVisible();

  await page.getByRole("button", { name: "Ver tabela" }).first().click();
  await expect(page.locator("table").first().locator("tbody tr")).toHaveCount(26);

  await page.getByRole("button", { name: "Sair da demonstração" }).click();
  await expect(page.getByText("O dashboard ainda não tem dados")).toBeVisible();
});
```

- [ ] **Step 2: List the tests**

Run: `npx playwright test --list`
Expected: 3 tests listed. (Running them needs a valid `SUPABASE_DB_URL`; until then, Step 3 is the check.)

- [ ] **Step 3: Visual check with a temporary preview page**

Create `__preview.html` + `__preview.tsx` at the repo root rendering `<PreferencesProvider><DashboardView teamName="Equipe Jurídico" /></PreferencesProvider>`, open `http://localhost:1420/__preview.html` with Playwright in light and dark at 1440×1000, click "Gerar demonstração", screenshot the team view and the "Carla Dias" view, hover a line chart. Check: no overlapping end labels, axis labels readable, tooltips inside the frame, legend present on 2-series charts. Fix what is off, then **delete both preview files**.

- [ ] **Step 4: Docs**

`CLAUDE.md`, under Convenções, add:
```md
- Dashboard (`src/components/dashboard/`): cálculos puros em `src/lib/dashboard.ts` sobre um `DashboardData`; hoje só `src/lib/demoData.ts` gera dados (demonstração em memória, pessoas fictícias). Gráficos são SVG próprios com as cores `chart-1`/`chart-2`/`chart-ref` — validadas com a skill dataviz; não use outras cores em gráficos.
```
`README.md`, in Funcionalidades, add:
```md
- **Dashboard** de desempenho da equipe e de cada membro (entregas, criados x concluídos, carga, prazo), com modo demonstração
```

- [ ] **Step 5: Final verification and commit**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all green.

```bash
git add e2e/app.spec.ts CLAUDE.md README.md
git commit -m "Test and document the dashboard"
```
