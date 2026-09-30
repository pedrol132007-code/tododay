import { describe, expect, it } from "vitest";
import type { DashboardStatus, DashboardTask } from "../types";
import {
  addDays,
  buckets,
  completedDay,
  deliveredIn,
  deliveredLateIn,
  median,
  openAt,
  percentile,
  periodMetrics,
  presetRange,
  previousRange,
  rangeLength,
  seriesByBucket,
  statusOn,
  teamAverageSeries,
} from "./metrics";

let nextId = 1;
/** Tarefa de teste: `steps` são [dia, status] depois da criação (que é sempre planned). */
function task(created: string, steps: [string, DashboardStatus][] = [], due: string | null = null, assigneeId = "p1"): DashboardTask {
  return {
    id: `t${nextId++}`,
    title: "Tarefa",
    assigneeId,
    createdDay: created,
    dueDay: due,
    priority: null,
    labels: [],
    history: [{ day: created, to: "planned" }, ...steps.map(([day, to]) => ({ day, to }))],
  };
}

describe("dias e períodos", () => {
  it("soma dias atravessando meses e anos", () => {
    expect(addDays("2026-09-28", 3)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("monta os atalhos terminando hoje, com o número certo de dias", () => {
    const today = "2026-09-28";
    expect(presetRange("7d", today)).toEqual({ start: "2026-09-22", end: today });
    expect(rangeLength(presetRange("30d", today))).toBe(30);
    expect(rangeLength(presetRange("12w", today))).toBe(84);
    expect(rangeLength(presetRange("6m", today))).toBe(182);
  });

  it("o período anterior tem o mesmo tamanho e termina logo antes", () => {
    expect(previousRange({ start: "2026-09-22", end: "2026-09-28" })).toEqual({ start: "2026-09-15", end: "2026-09-21" });
    expect(rangeLength(previousRange({ start: "2026-03-01", end: "2026-04-10" }))).toBe(41);
  });

  it("agrupa por dia até 31 dias", () => {
    const b = buckets({ start: "2026-09-22", end: "2026-09-28" });
    expect(b).toHaveLength(7);
    expect(b[0]).toEqual({ start: "2026-09-22", end: "2026-09-22" });
    expect(b[6]).toEqual({ start: "2026-09-28", end: "2026-09-28" });
    expect(buckets({ start: "2026-08-30", end: "2026-09-29" })).toHaveLength(31);
  });

  it("acima de 31 dias, agrupa em blocos de 7 contados do fim; o primeiro pode ser menor", () => {
    const b = buckets(presetRange("12w", "2026-09-28"));
    expect(b).toHaveLength(12);
    expect(b[11]).toEqual({ start: "2026-09-22", end: "2026-09-28" });
    expect(b.every((r) => rangeLength(r) === 7)).toBe(true);

    const odd = buckets({ start: "2026-08-01", end: "2026-09-10" }); // 41 dias = 1 bloco de 6 no começo + 5 de 7
    expect(odd[0]).toEqual({ start: "2026-08-01", end: "2026-08-06" });
    expect(odd.slice(1).every((r) => rangeLength(r) === 7)).toBe(true);
    expect(odd.at(-1)!.end).toBe("2026-09-10");
  });
});

describe("status da tarefa", () => {
  const t = task("2026-09-01", [["2026-09-03", "in_progress"], ["2026-09-10", "done"]]);

  it("não existe antes de ser criada", () => {
    expect(statusOn(t, "2026-08-31")).toBeNull();
  });

  it("segue o histórico dia a dia", () => {
    expect(statusOn(t, "2026-09-01")).toBe("planned");
    expect(statusOn(t, "2026-09-02")).toBe("planned");
    expect(statusOn(t, "2026-09-03")).toBe("in_progress");
    expect(statusOn(t, "2026-09-09")).toBe("in_progress");
    expect(statusOn(t, "2026-09-10")).toBe("done");
  });

  it("sabe o dia da conclusão, ou null se está aberta", () => {
    expect(completedDay(t)).toBe("2026-09-10");
    expect(completedDay(task("2026-09-01", [["2026-09-02", "in_progress"]]))).toBeNull();
  });
});

describe("percentil e mediana", () => {
  it("usa o posto mais próximo: 85% dos valores ficam até o p85", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(values, 0.85)).toBe(9); // ceil(8,5) = 9º valor
    const covered = values.filter((v) => v <= percentile(values, 0.85)!).length / values.length;
    expect(covered).toBeGreaterThanOrEqual(0.85);
  });

  it("não depende da ordem e trata os casos pequenos", () => {
    expect(percentile([10, 1, 5], 0.85)).toBe(10);
    expect(percentile([4], 0.85)).toBe(4);
    expect(percentile([], 0.85)).toBeNull();
  });

  it("mediana com quantidade ímpar e par", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("métricas do período", () => {
  const range = { start: "2026-09-01", end: "2026-09-30" };
  const tasks = [
    // Entregue no período, 4 dias, no prazo.
    task("2026-09-02", [["2026-09-03", "in_progress"], ["2026-09-06", "done"]], "2026-09-06"),
    // Entregue no período, 10 dias, atrasada.
    task("2026-09-05", [["2026-09-06", "in_progress"], ["2026-09-15", "done"]], "2026-09-10"),
    // Entregue no período, sem prazo, criada antes do período.
    task("2026-08-20", [["2026-08-25", "in_progress"], ["2026-09-02", "done"]]),
    // Criada no período, ainda em andamento no fim.
    task("2026-09-20", [["2026-09-21", "in_progress"]]),
    // Criada no período, ainda planejada no fim.
    task("2026-09-28"),
    // Entregue depois do período: conta como aberta no fim dele.
    task("2026-09-10", [["2026-09-11", "in_progress"], ["2026-10-02", "done"]]),
    // Criada depois do período: não conta em nada.
    task("2026-10-01"),
  ];

  const m = periodMetrics(tasks, range);

  it("conta criadas e entregues pelo dia em que aconteceram", () => {
    expect(m.created).toBe(5);
    expect(m.delivered).toBe(3);
    expect(m.backlogChange).toBe(2);
  });

  it("calcula tempo de conclusão (criação → conclusão) das entregues no período", () => {
    // 4, 10 e 13 dias.
    expect(m.cycleP85).toBe(13);
    expect(m.cycleMedian).toBe(10);
  });

  it("no prazo considera só as entregues com prazo", () => {
    expect(m.withDue).toBe(2);
    expect(m.onTimeRate).toBe(0.5);
  });

  it("estoque no fim: abertas (planejadas + em andamento) e só em andamento", () => {
    expect(m.openAtEnd).toBe(3);
    expect(m.inProgressAtEnd).toBe(2);
  });

  it("sem entregas, tempo e no prazo ficam nulos (nunca NaN)", () => {
    const empty = periodMetrics(tasks, { start: "2026-07-01", end: "2026-07-31" });
    expect(empty).toMatchObject({ created: 0, delivered: 0, cycleP85: null, cycleMedian: null, onTimeRate: null });
  });

  it("a série por bloco soma o mesmo que o período", () => {
    const series = seriesByBucket(tasks, range);
    expect(series).toHaveLength(rangeLength(range));
    expect(series.reduce((a, p) => a + p.delivered, 0)).toBe(m.delivered);
    expect(series.reduce((a, p) => a + p.created, 0)).toBe(m.created);
    expect(series.at(-1)!.openAtEnd).toBe(m.openAtEnd);
  });
});

describe("média da equipe", () => {
  const people = [
    { id: "ana", name: "Ana" },
    { id: "bia", name: "Bia" },
  ];
  const range = { start: "2026-09-01", end: "2026-09-14" };
  const tasks = [
    task("2026-09-01", [["2026-09-02", "in_progress"], ["2026-09-05", "done"]], "2026-09-06", "ana"),
    task("2026-09-02", [["2026-09-03", "in_progress"], ["2026-09-12", "done"]], "2026-09-08", "ana"),
    task("2026-09-03", [["2026-09-04", "in_progress"]], null, "bia"),
    task("2026-09-04", [["2026-09-05", "in_progress"]], null, "bia"),
  ];

  it("a média da equipe divide as contagens pelo número de pessoas e mantém as taxas da equipe", () => {
    const avg = teamAverageSeries(tasks, range, people.length);
    const team = seriesByBucket(tasks, range);
    expect(avg.map((p) => p.delivered)).toEqual(team.map((p) => p.delivered / 2));
    expect(avg.map((p) => p.openAtEnd)).toEqual(team.map((p) => p.openAtEnd / 2));
    expect(avg.map((p) => p.cycleP85)).toEqual(team.map((p) => p.cycleP85));
  });
});

describe("listas por trás dos números", () => {
  const range = { start: "2026-09-01", end: "2026-09-30" };
  const onTime = task("2026-09-02", [["2026-09-03", "in_progress"], ["2026-09-06", "done"]], "2026-09-06");
  const late = task("2026-09-05", [["2026-09-06", "in_progress"], ["2026-09-15", "done"]], "2026-09-10");
  const noDue = task("2026-08-20", [["2026-08-25", "in_progress"], ["2026-09-02", "done"]]);
  const before = task("2026-08-01", [["2026-08-02", "in_progress"], ["2026-08-10", "done"]], "2026-08-05");
  const open = task("2026-09-20", [["2026-09-21", "in_progress"]]);
  const doneAfter = task("2026-09-10", [["2026-09-11", "in_progress"], ["2026-10-02", "done"]]);
  const tasks = [onTime, late, noDue, before, open, doneAfter];

  it("entregues no período (o mesmo que o KPI Entregas conta)", () => {
    expect(deliveredIn(tasks, range)).toEqual([onTime, late, noDue]);
    expect(deliveredIn(tasks, range)).toHaveLength(periodMetrics(tasks, range).delivered);
  });

  it("entregues fora do prazo no período", () => {
    expect(deliveredLateIn(tasks, range)).toEqual([late]);
  });

  it("abertas num dia (o mesmo que o estoque de backlog)", () => {
    expect(openAt(tasks, range.end)).toEqual([open, doneAfter]);
    expect(openAt(tasks, range.end)).toHaveLength(periodMetrics(tasks, range).openAtEnd);
  });
});
