import { describe, expect, it } from "vitest";
import type { DashboardData } from "../types";
import { matchesFilters, personSlugs, type BoardFilters } from "./boardFilters";
import { alertTasks, attentionAlerts } from "./dashboardRules";
import { alertFilters, linkFilters, type LinkKind } from "./dashboardLinks";
import { demoBoard, demoFilterable } from "./demoBoard";
import { generateDemo } from "./demoData";
import { periodMetrics, presetRange } from "./metrics";
import { teamLoad } from "./teamLoad";

// O número que o dashboard mostra tem de ser a quantidade de cards no board filtrado pelo link dele.
const TODAY = new Date("2026-09-30T12:00:00");
const SEEDS = [1, 7, 42, 2026, 99999];

/** Cards do board de demonstração que passam nos filtros (o que a tela mostra). */
function boardCount(data: DashboardData, filters: BoardFilters): number {
  const slugs = personSlugs(data.people);
  return demoBoard(data)
    .flatMap((list) => list.tasks.map((t) => demoFilterable(t, list.status, slugs, data.today)))
    .filter((c) => matchesFilters(c, filters, data.today)).length;
}

describe.each(SEEDS)("dashboard e board contam igual (semente %i)", (seed) => {
  const data = generateDemo(seed, { today: TODAY });
  const slugs = personSlugs(data.people);
  const range = presetRange("12w", data.today);
  const load = teamLoad(data.people, data.tasks, range);

  it.each<[LinkKind, "inProgress" | "overdue" | "stalled"]>([
    ["inProgress", "inProgress"],
    ["overdue", "overdue"],
    ["stalled", "stalled"],
  ])("carga da equipe: %s de cada pessoa", (kind, field) => {
    for (const row of load) {
      expect(boardCount(data, linkFilters(kind, slugs.get(row.person.id)!)), `${row.person.name}`).toBe(row[field]);
    }
  });

  it("backlog: abertas da equipe e de cada pessoa", () => {
    expect(boardCount(data, linkFilters("open", null))).toBe(periodMetrics(data.tasks, range).openAtEnd);
    for (const p of data.people) {
      const own = data.tasks.filter((t) => t.assigneeId === p.id);
      expect(boardCount(data, linkFilters("open", slugs.get(p.id)!)), p.name).toBe(periodMetrics(own, range).openAtEnd);
    }
  });

  it("cada alerta do Atenção, na equipe e no detalhe de cada pessoa", () => {
    const views = [
      attentionAlerts(data.people, data.tasks, data.today),
      ...data.people.map((p) => attentionAlerts([p], data.tasks.filter((t) => t.assigneeId === p.id), data.today, { perFact: true })),
    ];
    for (const alert of views.flat()) {
      expect(boardCount(data, alertFilters(alert, slugs)), alert.text).toBe(alertTasks(data.tasks, alert, data.today).length);
    }
  });
});
