import { describe, expect, it } from "vitest";
import { coversScenarios, DEMO_PEOPLE, generateDemo, generateDemoTasks } from "./demoData";
import { DEMO_LABELS, demoBoard } from "./demoBoard";
import { PRIORITIES } from "./boardVisuals";
import { addDays, completedDay, daysBetween, periodMetrics, presetRange, previousRange, statusOn } from "./metrics";
import { isInProgress, isOverdue, isOverloaded, OVERLOAD_IN_PROGRESS, STALLED_DAYS, DUE_SOON_DAYS, stalledDays } from "./dashboardRules";

const today = new Date(2026, 8, 28); // segunda, 28/09/2026
const TODAY = "2026-09-28";

describe("generateDemoTasks", () => {
  const data = generateDemoTasks(42, { today });

  it("é demonstração, com as pessoas fictícias e o dia de hoje", () => {
    expect(data.isDemo).toBe(true);
    expect(data.people).toEqual(DEMO_PEOPLE);
    expect(data.today).toBe(TODAY);
  });

  it("é reproduzível pela semente e muda entre sementes", () => {
    expect(generateDemoTasks(42, { today })).toEqual(data);
    expect(generateDemoTasks(43, { today }).tasks).not.toEqual(data.tasks);
  });

  it("tem histórico coerente em toda tarefa", () => {
    for (const t of data.tasks) {
      expect(DEMO_PEOPLE.some((p) => p.id === t.assigneeId)).toBe(true);
      expect(t.history[0]).toEqual({ day: t.createdDay, to: "planned" });
      for (let i = 1; i < t.history.length; i++) expect(t.history[i].day > t.history[i - 1].day).toBe(true);
      expect(t.history.map((h) => h.to).join(">")).toMatch(/^planned(>in_progress(>done)?)?$/);
      expect(t.history.at(-1)!.day <= TODAY).toBe(true);
      if (t.dueDay) expect(t.dueDay > t.createdDay).toBe(true);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.title).not.toMatch(/[{}]/);
      expect(t.priority === null || PRIORITIES.includes(t.priority)).toBe(true);
      for (const label of t.labels) expect(DEMO_LABELS.some((l) => l.name === label)).toBe(true);
    }
    expect(new Set(data.tasks.map((t) => t.id)).size).toBe(data.tasks.length);
  });

  it("cobre 6 meses e mais 6 meses anteriores para comparar", () => {
    expect(data.since <= previousRange(presetRange("6m", TODAY)).start).toBe(true);
    // Antes de `since` fica só o aquecimento: o estoque já está formado quando os dados começam.
    expect(periodMetrics(data.tasks, { start: data.since, end: data.since }).openAtEnd).toBeGreaterThan(10);
  });

  it("tem volume parecido com o de antes (3 a 8 entregas por pessoa por semana)", () => {
    const m = periodMetrics(data.tasks, presetRange("12w", TODAY));
    const perPersonWeek = m.delivered / 5 / 12;
    expect(perPersonWeek).toBeGreaterThan(2.5);
    expect(perPersonWeek).toBeLessThan(10);
  });

  it("não entrega em fim de semana", () => {
    for (const t of data.tasks) {
      const done = completedDay(t);
      if (!done) continue;
      const weekday = new Date(`${done}T12:00:00Z`).getUTCDay();
      expect(weekday === 0 || weekday === 6).toBe(false);
    }
  });

  // Os cenários que o dashboard precisa mostrar aparecem em qualquer semente pedida à tela.
  const seeds = Array.from({ length: 30 }, (_, i) => generateDemo(1000 + i * 37, { today }));

  it("sempre tem tarefas atrasadas e vencendo em breve", () => {
    for (const d of seeds) {
      const open = d.tasks.filter((t) => !completedDay(t) && t.dueDay);
      expect(open.filter((t) => t.dueDay! < TODAY).length).toBeGreaterThan(0);
      expect(open.filter((t) => t.dueDay! >= TODAY && daysBetween(TODAY, t.dueDay!) <= DUE_SOON_DAYS).length).toBeGreaterThan(0);
    }
  });

  it("sempre tem tarefas paradas (em andamento, sem mudar de status há mais de 7 dias)", () => {
    for (const d of seeds) {
      const stalled = d.tasks.filter(
        (t) => statusOn(t, TODAY) === "in_progress" && daysBetween(t.history.at(-1)!.day, TODAY) > STALLED_DAYS,
      );
      expect(stalled.length).toBeGreaterThan(0);
    }
  });

  it("sempre tem alguém acima do limite de sobrecarga, mas não todo mundo", () => {
    for (const d of seeds) {
      const load = d.people.map((p) => d.tasks.filter((t) => t.assigneeId === p.id && statusOn(t, TODAY) === "in_progress").length);
      expect(load.some((n) => n > OVERLOAD_IN_PROGRESS)).toBe(true);
      expect(load.filter((n) => n > OVERLOAD_IN_PROGRESS).length).toBeLessThan(d.people.length);
    }
  });

  it("raramente deixa alguém sem nada em andamento", () => {
    let zero = 0, total = 0;
    for (const d of seeds) {
      for (let k = 0; k < 84; k += 3) {
        const day = addDays(TODAY, -k);
        for (const p of d.people) {
          total++;
          if (!d.tasks.some((t) => t.assigneeId === p.id && statusOn(t, day) === "in_progress")) zero++;
        }
      }
    }
    expect(zero / total).toBeLessThan(0.08);
  });

  it("tem entregas no prazo e fora dele, e tempos de conclusão plausíveis", () => {
    for (const d of seeds) {
      const m = periodMetrics(d.tasks, presetRange("12w", TODAY));
      expect(m.onTimeRate!).toBeGreaterThan(0.4);
      expect(m.onTimeRate!).toBeLessThan(0.98);
      expect(m.cycleMedian!).toBeGreaterThanOrEqual(1);
      expect(m.cycleP85!).toBeLessThan(40);
      expect(m.cycleP85!).toBeGreaterThanOrEqual(m.cycleMedian!);
    }
  });

  it("o backlog sobe e desce ao longo do tempo (ondas de acúmulo)", () => {
    for (const d of seeds.slice(0, 10)) {
      const stock = Array.from({ length: 26 }, (_, i) => periodMetrics(d.tasks, { start: d.since, end: addDays(TODAY, -7 * i) }).openAtEnd);
      expect(Math.max(...stock) - Math.min(...stock)).toBeGreaterThan(5);
    }
  });

  /** Os problemas de cada pessoa hoje. */
  const problems = (d: typeof data) =>
    d.people.map((p) => {
      const own = d.tasks.filter((t) => t.assigneeId === p.id);
      return {
        overloaded: isOverloaded(own.filter((t) => isInProgress(t, TODAY)).length),
        overdue: own.filter((t) => isOverdue(t, TODAY)),
        stalled: own.some((t) => stalledDays(t, TODAY) != null),
      };
    });

  it("espalha os problemas: sobrecarga, paradas e atrasos em pessoas diferentes, e alguém em dia", () => {
    for (const d of seeds) {
      const f = problems(d);
      expect(f.filter((x) => x.overloaded)).toHaveLength(1);
      expect(f.some((x) => x.overloaded && x.overdue.length === 0)).toBe(true);
      expect(f.some((x) => x.stalled && !x.overloaded && x.overdue.length === 0)).toBe(true);
      expect(f.some((x) => x.overdue.length > 0 && !x.overloaded && !x.stalled)).toBe(true);
      expect(f.some((x) => x.overdue.length === 0 && !x.overloaded && !x.stalled)).toBe(true);
      expect(f.some((x) => x.overloaded && x.stalled && x.overdue.length > 0)).toBe(false);
    }
  });

  it("os atrasos de hoje são leves: de 1 a 3 tarefas, vencidas há no máximo 4 dias, numa pessoa só", () => {
    for (const d of seeds) {
      const late = problems(d).filter((x) => x.overdue.length > 0);
      expect(late).toHaveLength(1);
      expect(late[0].overdue.length).toBeLessThanOrEqual(3);
      for (const t of late[0].overdue) expect(daysBetween(t.dueDay!, TODAY)).toBeLessThanOrEqual(4);
    }
  });

  it("o board de hoje não repete título", () => {
    for (const d of seeds) {
      const titles = demoBoard(d).flatMap((l) => l.tasks.map((t) => t.title));
      expect(new Set(titles).size).toBe(titles.length);
    }
  });

  it("tem cards com e sem prioridade e com e sem etiqueta", () => {
    expect(data.tasks.some((t) => t.priority === null)).toBe(true);
    for (const p of PRIORITIES) expect(data.tasks.some((t) => t.priority === p)).toBe(true);
    expect(data.tasks.some((t) => t.labels.length === 0)).toBe(true);
    expect(data.tasks.some((t) => t.labels.length === 2)).toBe(true);
  });

  it("generateDemo sempre devolve uma demonstração com todos os cenários", () => {
    for (let i = 0; i < 200; i++) expect(coversScenarios(generateDemo(7 + i * 7919, { today }))).toBe(true);
  }, 30_000); // ~35 ms por demonstração

  it("generateDemo usa a própria semente quando ela já cobre tudo", () => {
    expect(coversScenarios(data)).toBe(true);
    expect(generateDemo(42, { today })).toEqual(data);
  });
});
