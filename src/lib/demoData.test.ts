import { describe, expect, it } from "vitest";
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
});
