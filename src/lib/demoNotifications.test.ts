import { describe, expect, it } from "vitest";
import type { DashboardData, DashboardTask } from "../types";
import { demoAvatarUrl } from "./demoAvatars";
import { demoAttachments } from "./demoBoard";
import { DEMO_PEOPLE, generateDemo } from "./demoData";
import { demoNotifications } from "./demoNotifications";
import { addDays } from "./metrics";

const today = "2026-10-07";
const task = (id: string, assigneeId: string, dueDay: string | null): DashboardTask => ({
  id,
  title: `Tarefa ${id}`,
  assigneeId,
  createdDay: "2026-09-01",
  dueDay,
  priority: null,
  labels: [],
  history: [{ day: "2026-09-01", to: "planned" }],
});

describe("demoAvatarUrl", () => {
  it("é uma imagem SVG reproduzível", () => {
    expect(demoAvatarUrl("demo-ana", "Ana Souza")).toMatch(/^data:image\/svg\+xml,/);
    expect(demoAvatarUrl("demo-ana", "Ana Souza")).toBe(demoAvatarUrl("demo-ana", "Ana Souza"));
  });
});

describe("DEMO_PEOPLE", () => {
  it("tem um líder, com foto, e gente com e sem foto", () => {
    expect(DEMO_PEOPLE.filter((p) => p.isLeader)).toHaveLength(1);
    expect(DEMO_PEOPLE.find((p) => p.isLeader)!.avatarUrl).toBeTruthy();
    expect(DEMO_PEOPLE.some((p) => !p.avatarUrl)).toBe(true);
  });
});

describe("demoNotifications", () => {
  const leader = DEMO_PEOPLE.find((p) => p.isLeader)!;
  const someone = DEMO_PEOPLE.find((p) => !p.isLeader)!;

  it("com prazos em todas as janelas, gera um item de cada tipo", () => {
    const d: DashboardData = {
      people: DEMO_PEOPLE,
      today,
      since: "2026-01-01",
      isDemo: true,
      tasks: [
        task("t1", someone.id, addDays(today, 3)),
        task("t2", someone.id, addDays(today, 1)),
        task("t3", someone.id, addDays(today, -1)),
        task("t4", someone.id, null),
      ],
    };
    const items = demoNotifications(d, new Map());
    expect(new Set(items.map((i) => i.kind))).toEqual(new Set(["assigned", "changed", "due_3d", "due_1d", "overdue"]));
    const assigned = items.find((i) => i.kind === "assigned")!;
    expect(assigned.actor?.id).toBe(leader.id);
    expect(assigned.fromLeader).toBe(true);
    expect(assigned.excerpt).not.toBe("");
    expect(items.some((i) => !i.read) && items.some((i) => i.read)).toBe(true);
    expect(items.every((i) => i.cardId === null)).toBe(true);
  });

  it("nunca inventa prazo: sem tarefa na janela, sem aviso daquele tipo", () => {
    const d: DashboardData = { people: DEMO_PEOPLE, today, since: "2026-01-01", isDemo: true, tasks: [task("t4", someone.id, null)] };
    const kinds = demoNotifications(d, new Map()).map((i) => i.kind);
    expect(kinds).toContain("assigned");
    expect(kinds).not.toContain("due_1d");
    expect(kinds).not.toContain("overdue");
  });

  it("na demonstração gerada, os avisos de prazo batem com as tarefas", () => {
    const d = generateDemo(42, { today: new Date("2026-10-07T12:00:00") });
    const items = demoNotifications(d, demoAttachments(d));
    expect(items.map((i) => i.kind)).toContain("assigned");
    // Títulos podem se repetir: basta existir uma tarefa com esse título e o prazo certo.
    for (const i of items.filter((x) => x.kind === "due_1d")) {
      expect(d.tasks.some((x) => x.title === i.cardTitle && x.dueDay === addDays(d.today, 1))).toBe(true);
    }
  });
});
