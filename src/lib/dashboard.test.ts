import { describe, expect, it } from "vitest";
import type { DashboardData, DashboardWeek } from "../types";
import { compare, perPerson, periodWeeks, summary, teamAverageSeries, weeklySeries } from "./dashboard";

const row = (personId: string, weekStart: string, r: Partial<DashboardWeek>): DashboardWeek => ({
  personId, weekStart, created: 0, delivered: 0, inProgress: 0, cycleDaysTotal: 0, withDue: 0, onTime: 0, ...r,
});

const data: DashboardData = {
  isDemo: true,
  people: [{ id: "a", name: "Ana" }, { id: "b", name: "Bruno" }],
  weeks: ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"],
  rows: [
    row("a", "2026-08-31", { created: 2, delivered: 1, inProgress: 3, cycleDaysTotal: 4, withDue: 1, onTime: 1 }),
    row("b", "2026-08-31", { created: 1, delivered: 1, inProgress: 1, cycleDaysTotal: 2, withDue: 1, onTime: 0 }),
    row("a", "2026-09-07", { created: 3, delivered: 4, inProgress: 2, cycleDaysTotal: 12, withDue: 2, onTime: 2 }),
    row("b", "2026-09-07", { created: 2, delivered: 0, inProgress: 3 }),
    row("a", "2026-09-14", { created: 1, delivered: 2, inProgress: 1, cycleDaysTotal: 6, withDue: 2, onTime: 1 }),
    row("b", "2026-09-14", { created: 2, delivered: 3, inProgress: 2, cycleDaysTotal: 9, withDue: 3, onTime: 3 }),
    row("a", "2026-09-21", { created: 2, delivered: 2, inProgress: 1, cycleDaysTotal: 4, withDue: 0, onTime: 0 }),
    row("b", "2026-09-21", { created: 0, delivered: 1, inProgress: 1, cycleDaysTotal: 5, withDue: 1, onTime: 1 }),
  ],
};

describe("periodWeeks", () => {
  it("takes the last N weeks", () => {
    expect(periodWeeks(data, 2)).toEqual(["2026-09-14", "2026-09-21"]);
  });
  it("takes the N weeks before that with offset 1", () => {
    expect(periodWeeks(data, 2, 1)).toEqual(["2026-08-31", "2026-09-07"]);
  });
  it("returns what exists when the data is shorter than the period", () => {
    expect(periodWeeks(data, 3, 1)).toEqual(["2026-08-31"]);
    expect(periodWeeks(data, 4, 1)).toEqual([]);
  });
});

describe("weeklySeries", () => {
  it("sums the whole team per week", () => {
    const s = weeklySeries(data, ["2026-09-14"]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ weekStart: "2026-09-14", created: 3, delivered: 5, inProgress: 3, avgCycleDays: 3, onTimeRate: 0.8 });
  });
  it("filters one person", () => {
    const s = weeklySeries(data, ["2026-09-07"], "a");
    expect(s[0]).toMatchObject({ created: 3, delivered: 4, avgCycleDays: 3, onTimeRate: 1 });
  });
  it("uses null rates when nothing was delivered or nothing had a due date", () => {
    const s = weeklySeries(data, ["2026-09-07", "2026-09-21"], "b");
    expect(s[0].avgCycleDays).toBeNull();
    expect(s[0].onTimeRate).toBeNull();
    expect(s[1].onTimeRate).toBe(1);
  });
});

describe("teamAverageSeries", () => {
  it("divides counts by the number of people and keeps rates", () => {
    const s = teamAverageSeries(data, ["2026-09-14"]);
    expect(s[0]).toMatchObject({ created: 1.5, delivered: 2.5, inProgress: 1.5, avgCycleDays: 3, onTimeRate: 0.8 });
  });
});

describe("summary", () => {
  it("totals the period and weights the averages by volume", () => {
    const s = summary(weeklySeries(data, periodWeeks(data, 2)));
    expect(s).toEqual({ created: 5, delivered: 8, balance: -3, avgCycleDays: 3, onTimeRate: 5 / 6, endInProgress: 2 });
  });
  it("returns null rates for a period with no deliveries", () => {
    const s = summary(weeklySeries(data, ["2026-09-07"], "b"));
    expect(s.avgCycleDays).toBeNull();
    expect(s.onTimeRate).toBeNull();
  });
  it("handles an empty period", () => {
    expect(summary([])).toEqual({ created: 0, delivered: 0, balance: 0, avgCycleDays: null, onTimeRate: null, endInProgress: 0 });
  });
});

describe("compare", () => {
  it("gives the relative change", () => {
    expect(compare(12, 10)).toBeCloseTo(0.2);
    expect(compare(5, 10)).toBeCloseTo(-0.5);
  });
  it("is null without a usable previous value", () => {
    expect(compare(5, 0)).toBeNull();
    expect(compare(5, null)).toBeNull();
    expect(compare(null, 3)).toBeNull();
  });
});

describe("perPerson", () => {
  it("scores each person in the period, most deliveries first", () => {
    expect(perPerson(data, periodWeeks(data, 2))).toEqual([
      {
        person: { id: "a", name: "Ana" },
        delivered: 4,
        inProgress: 1,
        avgCycleDays: 2.5,
        onTimeRate: 0.5,
        weekly: [2, 2],
        flags: { inProgress: false, avgCycleDays: false, onTimeRate: true },
      },
      {
        person: { id: "b", name: "Bruno" },
        delivered: 4,
        inProgress: 1,
        avgCycleDays: 3.5,
        onTimeRate: 1,
        weekly: [3, 1],
        flags: { inProgress: false, avgCycleDays: false, onTimeRate: false },
      },
    ]);
    expect(perPerson(data, periodWeeks(data, 2, 1))[0].person.id).toBe("a");
  });
  it("flags work in progress and cycle time well above the team", () => {
    const [a, b] = perPerson(data, ["2026-08-31"]);
    // Ana: 3 em andamento vs. média 2 (> 1,3×); tempo 4 d vs. equipe 3 d (> 1,3×).
    expect(a.flags).toMatchObject({ inProgress: true, avgCycleDays: true });
    expect(b.flags).toMatchObject({ inProgress: false, avgCycleDays: false });
  });
  it("never flags a missing rate", () => {
    const b = perPerson(data, ["2026-09-07"]).find((r) => r.person.id === "b")!;
    expect(b.avgCycleDays).toBeNull();
    expect(b.flags).toEqual({ inProgress: false, avgCycleDays: false, onTimeRate: false });
  });
});
