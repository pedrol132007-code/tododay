import { describe, expect, it } from "vitest";
import { needsRebalance, positionBetween, rebalance, resolveInsertPosition } from "./position";

describe("positionBetween", () => {
  it("returns the midpoint between two positions", () => {
    expect(positionBetween(1, 2)).toBe(1.5);
  });

  it("returns prev + 1 when there is no next (append at end)", () => {
    expect(positionBetween(5, null)).toBe(6);
  });

  it("returns next - 1 when there is no prev (insert at start)", () => {
    expect(positionBetween(null, 3)).toBe(2);
  });

  it("returns 1 when the list is empty", () => {
    expect(positionBetween(null, null)).toBe(1);
  });
});

describe("needsRebalance", () => {
  it("is true when the gap between neighbors is too small", () => {
    expect(needsRebalance(1, 1.00000005)).toBe(true);
  });

  it("is false for a normal gap", () => {
    expect(needsRebalance(1, 2)).toBe(false);
  });
});

describe("rebalance", () => {
  it("renumbers items to sequential integers, preserving order and other fields", () => {
    const items = [
      { id: 10, position: 0.001 },
      { id: 20, position: 0.0011 },
      { id: 30, position: 5 },
    ];
    expect(rebalance(items)).toEqual([
      { id: 10, position: 1 },
      { id: 20, position: 2 },
      { id: 30, position: 3 },
    ]);
  });
});

describe("resolveInsertPosition", () => {
  it("computes a plain midpoint when the gap is healthy", () => {
    const siblings = [
      { id: 1, position: 1 },
      { id: 2, position: 2 },
    ];
    expect(resolveInsertPosition(siblings, 1)).toEqual({ position: 1.5 });
  });

  it("appends after the last item when inserting at the end", () => {
    const siblings = [{ id: 1, position: 1 }];
    expect(resolveInsertPosition(siblings, 1)).toEqual({ position: 2 });
  });

  it("triggers a rebalance when the gap has collapsed", () => {
    const siblings = [
      { id: 1, position: 1 },
      { id: 2, position: 1.00000005 },
      { id: 3, position: 2 },
    ];
    const result = resolveInsertPosition(siblings, 1);
    expect(result.rebalanced).toEqual([
      { id: 1, position: 1 },
      { id: 2, position: 2 },
      { id: 3, position: 3 },
    ]);
    expect(result.position).toBe(1.5);
  });
});
