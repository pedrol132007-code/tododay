import { describe, expect, it } from "vitest";
import { axis, labelStep } from "./chartScale";

describe("axis", () => {
  it("picks a 1/2/5 step first and rounds the maximum up to it", () => {
    expect(axis(23, { integer: true })).toEqual({ max: 25, ticks: [0, 5, 10, 15, 20, 25] });
    expect(axis(7, { integer: true })).toEqual({ max: 8, ticks: [0, 2, 4, 6, 8] });
    expect(axis(37, { integer: true })).toEqual({ max: 40, ticks: [0, 10, 20, 30, 40] });
    expect(axis(130).max).toBe(150);
  });

  it("never shows fractional ticks for counts", () => {
    for (let v = 1; v <= 200; v++) {
      const a = axis(v, { integer: true });
      for (const t of a.ticks) expect(Number.isInteger(t)).toBe(true);
      expect(a.max).toBeGreaterThanOrEqual(v);
    }
    expect(axis(1.3, { integer: true })).toEqual({ max: 2, ticks: [0, 1, 2] });
  });

  it("keeps between 3 and 5 intervals and little empty headroom", () => {
    for (let v = 3; v <= 200; v++) {
      const a = axis(v, { integer: true });
      expect(a.ticks.length - 1).toBeGreaterThanOrEqual(3);
      expect(a.ticks.length - 1).toBeLessThanOrEqual(5);
      expect(a.max / v).toBeLessThanOrEqual(1.5);
    }
  });

  it("tops a percent axis out at 100 when values are near it", () => {
    expect(axis(96, { integer: true })).toEqual({ max: 100, ticks: [0, 20, 40, 60, 80, 100] });
    expect(axis(100, { integer: true }).max).toBe(100);
  });

  it("allows decimal steps when not restricted to integers, without float noise", () => {
    expect(axis(0.87)).toEqual({ max: 1, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1] });
  });

  it("never returns an empty axis", () => {
    expect(axis(0)).toEqual({ max: 1, ticks: [0, 1] });
    expect(axis(-3, { integer: true })).toEqual({ max: 1, ticks: [0, 1] });
    expect(axis(0.001, { integer: true })).toEqual({ max: 1, ticks: [0, 1] });
  });
});

describe("labelStep", () => {
  it("shows every label when there is room", () => {
    expect(labelStep(4, 400)).toBe(1);
  });
  it("skips labels so they stay at least ~56px apart", () => {
    expect(labelStep(26, 400)).toBe(4);
    expect(labelStep(12, 0)).toBe(12);
  });
});
