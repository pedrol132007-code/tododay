import { describe, expect, it } from "vitest";
import type { DashboardStatus, DashboardTask } from "../types";
import { alertTasks, attentionAlerts, stalledList, isDueSoon, isOverdue, isOverloaded, MAX_ALERTS, OVERLOAD_IN_PROGRESS, stalledDays } from "./dashboardRules";

const TODAY = "2026-09-28";

function task(steps: [string, DashboardStatus][], due: string | null = null): DashboardTask {
  return { id: "t", title: "T", assigneeId: "p", createdDay: steps[0][0], dueDay: due, history: steps.map(([day, to]) => ({ day, to })) };
}

describe("regras de risco", () => {
  it("atrasada: passou do prazo e não foi concluída", () => {
    expect(isOverdue(task([["2026-09-01", "planned"]], "2026-09-27"), TODAY)).toBe(true);
    expect(isOverdue(task([["2026-09-01", "planned"]], TODAY), TODAY)).toBe(false); // vence hoje ainda não atrasou
    expect(isOverdue(task([["2026-09-01", "planned"], ["2026-09-26", "in_progress"], ["2026-09-28", "done"]], "2026-09-27"), TODAY)).toBe(false);
    expect(isOverdue(task([["2026-09-01", "planned"]]), TODAY)).toBe(false);
  });

  it("vence em breve: prazo de hoje até daqui a 3 dias, ainda aberta", () => {
    expect(isDueSoon(task([["2026-09-01", "planned"]], TODAY), TODAY)).toBe(true);
    expect(isDueSoon(task([["2026-09-01", "planned"]], "2026-10-01"), TODAY)).toBe(true);
    expect(isDueSoon(task([["2026-09-01", "planned"]], "2026-10-02"), TODAY)).toBe(false);
    expect(isDueSoon(task([["2026-09-01", "planned"]], "2026-09-27"), TODAY)).toBe(false);
  });

  it("parada: em andamento sem mudar de status há mais de 7 dias", () => {
    expect(stalledDays(task([["2026-09-01", "planned"], ["2026-09-20", "in_progress"]]), TODAY)).toBe(8);
    expect(stalledDays(task([["2026-09-01", "planned"], ["2026-09-21", "in_progress"]]), TODAY)).toBeNull(); // exatamente 7
    expect(stalledDays(task([["2026-09-01", "planned"]]), TODAY)).toBeNull(); // planejada esperando não conta
    expect(stalledDays(task([["2026-09-01", "planned"], ["2026-09-02", "in_progress"], ["2026-09-10", "done"]]), TODAY)).toBeNull();
  });

  it("sobrecarga: acima do limite fixo", () => {
    expect(isOverloaded(OVERLOAD_IN_PROGRESS)).toBe(false);
    expect(isOverloaded(OVERLOAD_IN_PROGRESS + 1)).toBe(true);
  });

  it("avalia no dia pedido: concluída depois ainda estava atrasada/vencendo naquele dia", () => {
    const t = task([["2026-09-01", "planned"], ["2026-09-02", "in_progress"], ["2026-09-20", "done"]], "2026-09-10");
    expect(isOverdue(t, "2026-09-15")).toBe(true);
    expect(isOverdue(t, "2026-09-20")).toBe(false);
    expect(isDueSoon(t, "2026-09-08")).toBe(true);
    expect(isDueSoon(t, "2026-08-31")).toBe(false); // ainda nem existia
    expect(stalledDays(t, "2026-09-15")).toBe(13);
  });
});

describe("alertas de atenção", () => {
  const people = [
    { id: "ana", name: "Ana Souza" },
    { id: "bia", name: "Bia Lopes" },
    { id: "caio", name: "Caio Reis" },
    { id: "duda", name: "Duda Melo" },
  ];
  const t = (assigneeId: string, steps: [string, DashboardStatus][], due: string | null = null) => ({ ...task(steps, due), id: `${assigneeId}-${Math.random()}`, assigneeId });
  const busy = (id: string, n: number, since = "2026-09-25") =>
    Array.from({ length: n }, () => t(id, [["2026-09-01", "planned"], [since, "in_progress"]]));

  const tasks = [
    // Ana: 2 atrasadas (uma planejada, uma em andamento há pouco).
    t("ana", [["2026-09-01", "planned"]], "2026-09-20"),
    t("ana", [["2026-09-01", "planned"], ["2026-09-26", "in_progress"]], "2026-09-25"),
    // Bia: 10 em andamento (acima do limite), 3 delas paradas.
    ...busy("bia", 7),
    ...busy("bia", 3, "2026-09-10"),
    // Caio: 1 parada.
    ...busy("caio", 1, "2026-09-01"),
    // Duda: 1 vencendo em breve.
    t("duda", [["2026-09-01", "planned"]], "2026-09-30"),
  ];
  const alerts = attentionAlerts(people, tasks, TODAY);

  it("gera um alerta por pessoa em risco e um para prazos próximos, na ordem de gravidade", () => {
    expect(alerts.map((a) => a.kind)).toEqual(["overdue", "overload", "stalled", "dueSoon"]);
    expect(alerts.map((a) => a.personId ?? null)).toEqual(["ana", "bia", "caio", null]);
  });

  it("escreve fatos de carga e risco, com o primeiro nome e plural certo", () => {
    expect(alerts[0].text).toBe("Ana tem 2 tarefas atrasadas");
    expect(alerts[1].text).toBe("Bia tem 10 em andamento (limite 8) e 3 paradas há mais de 7 dias");
    expect(alerts[2].text).toBe("Caio tem 1 tarefa parada há mais de 7 dias");
    expect(alerts[3].text).toBe("1 tarefa vence nos próximos 3 dias");
  });

  it("junta todos os fatos da pessoa na mesma frase", () => {
    const more = [...tasks, t("ana", [["2026-09-01", "planned"], ["2026-09-05", "in_progress"]], "2026-09-15"), ...busy("ana", 8)];
    const ana = attentionAlerts(people, more, TODAY).find((a) => a.personId === "ana")!;
    expect(ana.kind).toBe("overdue");
    expect(ana.text).toBe("Ana tem 3 tarefas atrasadas, 10 em andamento (limite 8) e 1 parada há mais de 7 dias");
  });

  it("mostra no máximo 5, os mais graves", () => {
    const crowd = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `Pessoa${i} X` }));
    const late = crowd.flatMap((p, i) => Array.from({ length: i + 1 }, () => t(p.id, [["2026-09-01", "planned"]], "2026-09-20")));
    const top = attentionAlerts(crowd, late, TODAY);
    expect(top).toHaveLength(MAX_ALERTS);
    expect(top.map((a) => a.personId)).toEqual(["p7", "p6", "p5", "p4", "p3"]);
  });

  it("sem nada em risco, não há alertas", () => {
    expect(attentionAlerts(people, busy("ana", 2), TODAY)).toEqual([]);
  });

  it("o filtro do alerta traz exatamente as tarefas que ele descreve", () => {
    const anaTasks = alertTasks(tasks, alerts[0], TODAY);
    expect(anaTasks).toHaveLength(2);
    expect(anaTasks.every((x) => x.assigneeId === "ana" && isOverdue(x, TODAY))).toBe(true);
    // Sobrecarga: tudo que a pessoa tem em andamento.
    expect(alertTasks(tasks, alerts[1], TODAY)).toHaveLength(10);
    expect(alertTasks(tasks, alerts[2], TODAY)).toHaveLength(1);
    expect(alertTasks(tasks, alerts[3], TODAY).map((x) => x.assigneeId)).toEqual(["duda"]);
  });
});

describe("lista do que está parado", () => {
  it("traz as paradas com os dias, a mais antiga primeiro", () => {
    const a = task([["2026-09-01", "planned"], ["2026-09-15", "in_progress"]]);
    const b = task([["2026-09-01", "planned"], ["2026-09-02", "in_progress"]]);
    const fresh = task([["2026-09-01", "planned"], ["2026-09-25", "in_progress"]]);
    expect(stalledList([a, b, fresh], TODAY)).toEqual([
      { task: b, days: 26 },
      { task: a, days: 13 },
    ]);
  });
});
