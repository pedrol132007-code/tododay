import { describe, expect, it } from "vitest";
import { labelStep, niceMax, ticks } from "./chartScale";

describe("niceMax", () => {
  it("rounds up to a readable axis maximum", () => {
    expect(niceMax(7)).toBe(10);
    expect(niceMax(23)).toBe(25);
    expect(niceMax(0.87)).toBe(1);
    expect(niceMax(100)).toBe(100);
    expect(niceMax(130)).toBe(200);
  });
  it("never returns zero", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-3)).toBe(1);
  });
});

describe("ticks", () => {
  it("splits the axis evenly from zero", () => {
    expect(ticks(20, 4)).toEqual([0, 5, 10, 15, 20]);
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
