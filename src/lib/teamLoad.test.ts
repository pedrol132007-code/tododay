import { describe, expect, it } from "vitest";
import type { DashboardStatus, DashboardTask } from "../types";
import { teamLoad } from "./teamLoad";

let nextId = 1;
function task(assigneeId: string, steps: [string, DashboardStatus][], due: string | null = null): DashboardTask {
  return { id: `t${nextId++}`, title: "T", assigneeId, createdDay: steps[0][0], dueDay: due, history: steps.map(([day, to]) => ({ day, to })) };
}

const people = [
  { id: "ana", name: "Ana" },
  { id: "bia", name: "Bia" },
  { id: "caio", name: "Caio" },
  { id: "duda", name: "Duda" },
];
const range = { start: "2026-09-01", end: "2026-09-28" };

const tasks = [
  // Ana: 3 em andamento, nenhuma atrasada, 1 entrega no prazo.
  task("ana", [["2026-09-20", "planned"], ["2026-09-25", "in_progress"]]),
  task("ana", [["2026-09-20", "planned"], ["2026-09-25", "in_progress"]]),
  task("ana", [["2026-09-20", "planned"], ["2026-09-25", "in_progress"]]),
  task("ana", [["2026-09-02", "planned"], ["2026-09-03", "in_progress"], ["2026-09-05", "done"]], "2026-09-06"),
  // Bia: 1 em andamento e atrasada, parada há 18 dias.
  task("bia", [["2026-09-01", "planned"], ["2026-09-10", "in_progress"]], "2026-09-15"),
  // Caio: 2 em andamento, 1 planejada atrasada; 1 entrega fora do prazo.
  task("caio", [["2026-09-20", "planned"], ["2026-09-22", "in_progress"]]),
  task("caio", [["2026-09-20", "planned"], ["2026-09-22", "in_progress"]]),
  task("caio", [["2026-09-01", "planned"]], "2026-09-20"),
  task("caio", [["2026-09-01", "planned"], ["2026-09-02", "in_progress"], ["2026-09-12", "done"]], "2026-09-08"),
  // Duda: nada.
];

describe("teamLoad", () => {
  const rows = teamLoad(people, tasks, range);
  const byId = Object.fromEntries(rows.map((r) => [r.person.id, r]));

  it("conta carga, atrasadas e paradas no último dia do período", () => {
    expect(byId.ana).toMatchObject({ inProgress: 3, overdue: 0, stalled: 0 });
    expect(byId.bia).toMatchObject({ inProgress: 1, overdue: 1, stalled: 1 });
    expect(byId.caio).toMatchObject({ inProgress: 2, overdue: 1, stalled: 0 });
    expect(byId.duda).toMatchObject({ inProgress: 0, overdue: 0, stalled: 0, delivered: 0, onTimeRate: null });
  });

  it("traz entregas e no prazo do período", () => {
    expect(byId.ana).toMatchObject({ delivered: 1, onTimeRate: 1 });
    expect(byId.caio).toMatchObject({ delivered: 1, onTimeRate: 0 });
  });

  it("marca sobrecarga pelo limite fixo", () => {
    const many = Array.from({ length: 9 }, () => task("duda", [["2026-09-20", "planned"], ["2026-09-26", "in_progress"]]));
    const d = teamLoad(people, [...tasks, ...many], range).find((r) => r.person.id === "duda")!;
    expect(d).toMatchObject({ inProgress: 9, overloaded: true });
    expect(byId.ana.overloaded).toBe(false);
  });

  it("ordena por risco: mais atrasadas primeiro, depois mais carga, nunca por entregas", () => {
    // Bia e Caio têm 1 atrasada; Caio tem mais carga. Ana tem mais carga que Duda.
    expect(rows.map((r) => r.person.id)).toEqual(["caio", "bia", "ana", "duda"]);
  });
});
