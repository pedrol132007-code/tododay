import { describe, expect, it } from "vitest";
import { groupMyTasks } from "./myTasks";

type P = "urgent" | "high" | "medium" | "low" | null;
const t = (title: string, due_date: string | null, priority: P = null) => ({ title, due_date, priority });
const ids = (groups: ReturnType<typeof groupMyTasks>) => groups.map((g) => [g.id, g.tasks.map((x) => x.title)]);

describe("Minhas tarefas por prazo", () => {
  // 2026-10-07 é uma quarta-feira; o domingo da semana é 2026-10-11.
  it("separa em atrasadas, hoje, esta semana (até domingo), depois e sem prazo", () => {
    const groups = groupMyTasks(
      [t("ontem", "2026-10-06"), t("hoje", "2026-10-07"), t("amanhã", "2026-10-08"), t("domingo", "2026-10-11"), t("segunda", "2026-10-12"), t("sem", null)],
      "2026-10-07",
    );
    expect(ids(groups)).toEqual([
      ["overdue", ["ontem"]],
      ["today", ["hoje"]],
      ["week", ["amanhã", "domingo"]],
      ["later", ["segunda"]],
      ["none", ["sem"]],
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Atrasadas", "Hoje", "Esta semana", "Depois", "Sem prazo"]);
  });

  it("num domingo, a segunda seguinte já é Depois", () => {
    expect(ids(groupMyTasks([t("segunda", "2026-10-12")], "2026-10-11"))).toEqual([["later", ["segunda"]]]);
  });

  it("ordena por prazo, depois prioridade (urgente primeiro, sem prioridade por último), depois título", () => {
    const groups = groupMyTasks(
      [t("b", "2026-10-09", "low"), t("a", "2026-10-09", "low"), t("x", "2026-10-09"), t("u", "2026-10-09", "urgent"), t("cedo", "2026-10-08")],
      "2026-10-07",
    );
    expect(ids(groups)).toEqual([["week", ["cedo", "u", "a", "b", "x"]]]);
  });

  it("sem tarefas, sem grupos", () => {
    expect(groupMyTasks([], "2026-10-07")).toEqual([]);
  });
});
