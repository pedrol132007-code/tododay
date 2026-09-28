import { describe, expect, it } from "vitest";
import { compare, periodWeeks, summary, weeklySeries } from "./dashboard";
import { DEMO_PEOPLE, generateDemoData } from "./demoData";

const today = new Date(2026, 8, 25); // quinta, 25/09/2026

describe("generateDemoData", () => {
  const data = generateDemoData(42, { today });

  it("is marked as a demo and uses the fictional people", () => {
    expect(data.isDemo).toBe(true);
    expect(data.people).toEqual(DEMO_PEOPLE);
    expect(data.people.map((p) => p.name)).toEqual(["Ana Souza", "Bruno Lima", "Carla Dias", "Diego Rocha", "Elisa Prado"]);
  });

  it("covers 52 consecutive weeks starting on Mondays and ending this week", () => {
    expect(data.weeks).toHaveLength(52);
    expect(data.weeks[51]).toBe("2026-09-21");
    for (let i = 0; i < data.weeks.length; i++) {
      const [y, m, d] = data.weeks[i].split("-").map(Number);
      expect(new Date(y, m - 1, d).getDay()).toBe(1);
      if (i > 0) {
        const [py, pm, pd] = data.weeks[i - 1].split("-").map(Number);
        const days = (new Date(y, m - 1, d).getTime() - new Date(py, pm - 1, pd).getTime()) / 86_400_000;
        expect(Math.round(days)).toBe(7);
      }
    }
  });

  it("has one row per person per week with consistent numbers", () => {
    expect(data.rows).toHaveLength(52 * 5);
    for (const r of data.rows) {
      for (const n of [r.created, r.delivered, r.inProgress, r.withDue, r.onTime]) {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      }
      expect(r.delivered).toBeLessThanOrEqual(14);
      expect(r.withDue).toBeLessThanOrEqual(r.delivered);
      expect(r.onTime).toBeLessThanOrEqual(r.withDue);
      if (r.delivered > 0) {
        const avg = r.cycleDaysTotal / r.delivered;
        expect(avg).toBeGreaterThanOrEqual(1);
        expect(avg).toBeLessThanOrEqual(12);
      } else {
        expect(r.cycleDaysTotal).toBe(0);
      }
    }
  });

  it("is reproducible for a seed and different across seeds", () => {
    expect(generateDemoData(42, { today })).toEqual(data);
    expect(generateDemoData(43, { today }).rows).not.toEqual(data.rows);
  });

  it("respects a custom length", () => {
    expect(generateDemoData(1, { today, weeks: 8 }).weeks).toHaveLength(8);
  });

  // Estoque e fluxo: o que está em andamento só muda pelo que entrou e saiu.
  const seeds = Array.from({ length: 20 }, (_, i) => generateDemoData(1000 + i * 37, { today }));
  const personRows = (d: ReturnType<typeof generateDemoData>) => d.people.map((p) => d.rows.filter((r) => r.personId === p.id));

  it("keeps work in progress equal to the previous week plus created minus delivered", () => {
    for (const d of [data, ...seeds]) {
      for (const rows of personRows(d)) {
        for (let t = 1; t < rows.length; t++) {
          expect(rows[t].inProgress).toBe(rows[t - 1].inProgress + rows[t].created - rows[t].delivered);
        }
      }
    }
  });

  it("rarely leaves someone with nothing in progress", () => {
    const all = seeds.flatMap((d) => d.rows);
    const zero = all.filter((r) => r.inProgress === 0).length;
    expect(zero / all.length).toBeLessThan(0.05);
  });

  it("keeps work in progress moving and in a plausible range", () => {
    let runs = 0;
    let people = 0;
    for (const d of seeds) {
      for (const rows of personRows(d)) {
        people++;
        let run = 1;
        for (let t = 1; t < rows.length; t++) {
          run = rows[t].inProgress === rows[t - 1].inProgress ? run + 1 : 1;
          if (run === 4) runs++;
        }
        expect(Math.max(...rows.map((r) => r.inProgress))).toBeLessThanOrEqual(25);
      }
    }
    // Quatro semanas seguidas com o mesmo número acontece, mas não em quase todo mundo.
    expect(runs / people).toBeLessThan(0.5);
  });

  it("lets cycle time and on-time rate change between 12-week periods", () => {
    const deltas = seeds.map((d) => {
      const cur = summary(weeklySeries(d, periodWeeks(d, 12)));
      const prev = summary(weeklySeries(d, periodWeeks(d, 12, 1)));
      return { cycle: compare(cur.avgCycleDays, prev.avgCycleDays)!, onTime: cur.onTimeRate! - prev.onTimeRate! };
    });
    // Em boa parte das sementes a variação é visível (≥ 5% no tempo, ≥ 2 pts no prazo).
    expect(deltas.filter((x) => Math.abs(x.cycle) >= 0.05).length).toBeGreaterThanOrEqual(seeds.length / 3);
    expect(deltas.filter((x) => Math.abs(x.onTime) >= 0.02).length).toBeGreaterThanOrEqual(seeds.length / 3);
  });
});
