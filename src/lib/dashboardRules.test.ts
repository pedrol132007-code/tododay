import { describe, expect, it } from "vitest";
import type { DashboardStatus, DashboardTask } from "../types";
import { isDueSoon, isOverdue, isOverloaded, OVERLOAD_IN_PROGRESS, stalledDays } from "./dashboardRules";

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
