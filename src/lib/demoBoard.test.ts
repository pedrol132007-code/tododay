import { describe, expect, it } from "vitest";
import { DEMO_DONE_DAYS, demoAttachments, demoBoard } from "./demoBoard";
import { generateDemo } from "./demoData";
import { PRIORITIES } from "./boardVisuals";
import { isOverWip, stalledDays } from "./dashboardRules";
import { completedDay, daysBetween, statusOn } from "./metrics";

const today = new Date(2026, 8, 28);
const TODAY = "2026-09-28";

describe("demoBoard", () => {
  const seeds = Array.from({ length: 20 }, (_, i) => generateDemo(500 + i * 101, { today }));

  it("tem colunas com nome e tipo realistas", () => {
    const lists = demoBoard(seeds[0]);
    expect(lists.map((l) => [l.name, l.status])).toEqual([
      ["A fazer", "todo"],
      ["Em andamento", "doing"],
      ["Em revisão", "doing"],
      ["Concluído", "done"],
    ]);
  });

  it("conta igual ao dashboard: planejadas em A fazer, em andamento nas duas colunas do meio", () => {
    for (const d of seeds) {
      const [todo, doing, review, done] = demoBoard(d);
      expect(todo.tasks.length).toBe(d.tasks.filter((t) => statusOn(t, TODAY) === "planned").length);
      expect(doing.tasks.length + review.tasks.length).toBe(d.tasks.filter((t) => statusOn(t, TODAY) === "in_progress").length);
      for (const t of done.tasks) expect(daysBetween(completedDay(t)!, TODAY)).toBeLessThan(DEMO_DONE_DAYS);
    }
  });

  it("o que está parado fica em Em andamento, nunca em revisão", () => {
    for (const d of seeds) {
      const [, doing, review] = demoBoard(d);
      expect(review.tasks.some((t) => stalledDays(t, TODAY) != null)).toBe(false);
      expect(doing.tasks.some((t) => stalledDays(t, TODAY) != null)).toBe(true);
    }
  });

  it("sempre tem pelo menos uma coluna acima do limite de WIP", () => {
    for (const d of seeds) expect(demoBoard(d).some((l) => isOverWip(l.tasks.length, l.wipLimit))).toBe(true);
  });

  it("ordena cada coluna aberta pela prioridade", () => {
    const rank = (p: (typeof PRIORITIES)[number] | null) => (p ? PRIORITIES.indexOf(p) : PRIORITIES.length);
    for (const list of demoBoard(seeds[0]).slice(0, 3)) {
      const ranks = list.tasks.map((t) => rank(t.priority));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it("põe anexos em alguns cards abertos, com imagem, PDF e uma capa", () => {
    for (const d of seeds) {
      const byTask = demoAttachments(d);
      const all = [...byTask.values()].flat();
      const openIds = new Set(demoBoard(d).filter((l) => l.status !== "done").flatMap((l) => l.tasks.map((t) => t.id)));
      expect(byTask.size).toBeGreaterThanOrEqual(3);
      expect(byTask.size).toBeLessThan(openIds.size / 2);
      for (const id of byTask.keys()) expect(openIds.has(id)).toBe(true);
      expect(all.some((a) => a.kind === "pdf")).toBe(true);
      expect(all.filter((a) => a.isCover)).toHaveLength(1);
      expect(all.find((a) => a.isCover)!.kind).toBe("image");
      for (const list of byTask.values()) {
        expect(list.length).toBeLessThanOrEqual(3);
        expect(new Set(list.map((a) => a.name)).size).toBe(list.length);
      }
    }
    expect(demoAttachments(seeds[0])).toEqual(demoAttachments(seeds[0]));
  });
});
