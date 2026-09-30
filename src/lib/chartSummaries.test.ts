import { describe, expect, it } from "vitest";
import { backlogSummary, deliveriesSummary, flowSummary, loadSummary, type SummaryPoint } from "./chartSummaries";
import { SUMMARY_DROP, SUMMARY_SMALL_BASE } from "./dashboardRules";

/** Pontos com rótulos "1 jul", "2 jul"...; só os campos que cada teste usa importam. */
const points = (fields: Partial<SummaryPoint>[]): SummaryPoint[] =>
  fields.map((f, i) => ({ label: `${i + 1} jul`, created: 0, delivered: 0, inProgressAtEnd: 0, ...f }));
const delivered = (...v: number[]) => points(v.map((delivered) => ({ delivered })));

describe("resumo das entregas", () => {
  it("destaca a melhor semana, com a média do período", () => {
    expect(deliveriesSummary(delivered(20, 30, 42, 28), "week")).toBe("Melhor semana: a de 3 jul, com 42 entregas (média de 30 por semana no período).");
  });

  it("empate: a mais recente", () => {
    expect(deliveriesSummary(delivered(30, 30, 20, 30), "week")).toContain("a de 4 jul");
  });

  it("queda relevante na última semana vem antes da melhor semana, em %", () => {
    // Média das anteriores: 30; a última tem 18 = 40% abaixo.
    expect(deliveriesSummary(delivered(30, 28, 32, 18), "week")).toBe("A última semana teve 18 entregas, 40% abaixo da média das outras semanas do período (30).");
  });

  it("queda com base pequena sai em valor absoluto", () => {
    expect(SUMMARY_SMALL_BASE).toBe(10);
    // Média das anteriores: 6 (< 10); a última tem 2.
    expect(deliveriesSummary(delivered(6, 5, 7, 2), "week")).toBe("A última semana teve 2 entregas, 4 a menos que a média das outras semanas do período (6).");
  });

  it("queda pequena não é relevante: volta para a melhor semana", () => {
    expect(SUMMARY_DROP).toBe(0.3);
    expect(deliveriesSummary(delivered(30, 30, 30, 25), "week")).toMatch(/^Melhor semana/);
  });

  it("por dia não aponta queda do último dia (fim de semana zera), só o melhor dia", () => {
    expect(deliveriesSummary(delivered(5, 9, 4, 0), "day")).toBe("Melhor dia: 2 jul, com 9 entregas (média de 4,5 por dia no período).");
  });

  it("tudo igual: frase neutra, sem inventar destaque", () => {
    expect(deliveriesSummary(delivered(10, 10, 10), "week")).toBe("Entregas constantes no período: 10 por semana.");
  });

  it("sem entregas, diz isso; com um ponto só, nada a comparar", () => {
    expect(deliveriesSummary(delivered(0, 0, 0), "week")).toBe("Nenhuma entrega no período.");
    expect(deliveriesSummary(delivered(7), "day")).toBeNull();
  });

  it("singular", () => {
    expect(deliveriesSummary(delivered(0, 1, 0), "day")).toBe("Melhor dia: 2 jul, com 1 entrega (média de 0,3 por dia no período).");
  });
});

describe("resumo de criados x concluídos", () => {
  const flow = (...pairs: [number, number][]) => points(pairs.map(([created, delivered]) => ({ created, delivered })));

  it("concluídos superaram criados na maioria das semanas", () => {
    expect(flowSummary(flow([10, 12], [10, 11], [10, 9], [10, 14]), "week")).toBe(
      "Concluídos superaram criados em 3 das 4 semanas do período (46 concluídos, 40 criados).",
    );
  });

  it("criados superaram concluídos na maioria dos dias", () => {
    expect(flowSummary(flow([3, 1], [2, 1], [1, 1]), "day")).toBe("Criados superaram concluídos em 2 dos 3 dias do período (6 criados, 3 concluídos).");
  });

  it("sem maioria: fluxo estável", () => {
    expect(flowSummary(flow([10, 12], [10, 8], [10, 10], [10, 10]), "week")).toBe("Fluxo estável no período: 40 criados, 40 concluídos.");
  });

  it("nada criado nem concluído: nenhuma frase", () => {
    expect(flowSummary(flow([0, 0], [0, 0]), "week")).toBeNull();
  });
});

describe("resumo do backlog", () => {
  it("cresceu / diminuiu / estável, sempre em tarefas", () => {
    expect(backlogSummary(9)).toBe("Backlog cresceu 9 tarefas no período.");
    expect(backlogSummary(-1)).toBe("Backlog diminuiu 1 tarefa no período.");
    expect(backlogSummary(0)).toBe("Backlog estável no período.");
  });
});

describe("resumo da carga (visão da pessoa)", () => {
  const load = (...v: number[]) => points(v.map((inProgressAtEnd) => ({ inProgressAtEnd })));

  it("de quanto para quanto foi o em andamento", () => {
    expect(loadSummary(load(3, 5, 7))).toBe("Em andamento foi de 3 para 7 tarefas ao longo do período.");
    expect(loadSummary(load(6, 2, 1))).toBe("Em andamento foi de 6 para 1 tarefa ao longo do período.");
  });

  it("igual no começo e no fim: estável", () => {
    expect(loadSummary(load(4, 6, 4))).toBe("Em andamento estável no período: 4 tarefas.");
  });

  it("um ponto só: nada", () => {
    expect(loadSummary(load(4))).toBeNull();
  });
});
