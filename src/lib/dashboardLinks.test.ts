import { describe, expect, it } from "vitest";
import type { DashboardData } from "../types";
import { matchesFilters, personSlugs, type BoardFilters } from "./boardFilters";
import { alertTasks, attentionAlerts } from "./dashboardRules";
import {
  alertFilters,
  boardLinkToSearch,
  clearBoardLink,
  DEFAULT_PERIOD,
  dashboardViewToSearch,
  linkFilters,
  parseBoardLink,
  parseDashboardView,
  type LinkKind,
} from "./dashboardLinks";
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

describe("estado do dashboard na URL (para o Voltar ao dashboard)", () => {
  it("período padrão e equipe não deixam nada na URL", () => {
    expect(dashboardViewToSearch({ period: DEFAULT_PERIOD, person: null })).toBe("");
    expect(parseDashboardView("")).toEqual({ period: DEFAULT_PERIOD, person: null });
  });

  it("ida e volta com atalho e pessoa, mantendo os filtros do board", () => {
    const state = { period: { kind: "preset", preset: "30d" }, person: "ana" } as const;
    const search = dashboardViewToSearch(state, "?atrasadas=1");
    expect(search).toBe("?atrasadas=1&periodo=30d&pessoa=ana");
    expect(parseDashboardView(search)).toEqual(state);
  });

  it("ida e volta com intervalo personalizado", () => {
    const state = { period: { kind: "custom", range: { start: "2026-08-01", end: "2026-08-31" } }, person: null } as const;
    expect(dashboardViewToSearch(state)).toBe("?de=2026-08-01&ate=2026-08-31");
    expect(parseDashboardView("?de=2026-08-01&ate=2026-08-31")).toEqual(state);
  });

  it("valor inválido volta ao padrão", () => {
    expect(parseDashboardView("?periodo=1ano").period).toEqual(DEFAULT_PERIOD);
    expect(parseDashboardView("?de=2026-09-10&ate=2026-09-01").period).toEqual(DEFAULT_PERIOD);
    expect(parseDashboardView("?de=ontem&ate=hoje").period).toEqual(DEFAULT_PERIOD);
  });
});

describe("link do dashboard para o board", () => {
  it("leva os filtros, de onde veio e o card a abrir", () => {
    const search = boardLinkToSearch({ filters: linkFilters("overdue", "ana"), origin: "Atenção · Ana tem 2 tarefas atrasadas", card: "t12" }, "?periodo=30d");
    const p = new URLSearchParams(search);
    expect(p.get("periodo")).toBe("30d");
    expect(p.get("responsavel")).toBe("ana");
    expect(p.get("atrasadas")).toBe("1");
    expect(parseBoardLink(search)).toEqual({ origin: "Atenção · Ana tem 2 tarefas atrasadas", card: "t12" });
  });

  it("sair do link limpa filtros, origem e card, e deixa o estado do dashboard", () => {
    const search = boardLinkToSearch({ filters: linkFilters("stalled", "ana"), origin: "Carga da equipe", card: "t1" }, "?periodo=7d&pessoa=ana");
    expect(clearBoardLink(search)).toBe("?periodo=7d&pessoa=ana");
  });

  it("sem link: nada", () => {
    expect(parseBoardLink("?responsavel=ana")).toEqual({ origin: null, card: null });
  });
});
