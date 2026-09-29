import { describe, expect, it } from "vitest";
import { formatDue, memberColor, MEMBER_COLORS } from "./boardVisuals";

const today = new Date(2026, 8, 25, 15, 30); // 25/09/2026, meio da tarde

describe("formatDue", () => {
  it("shows day and short month in Portuguese", () => {
    expect(formatDue("2026-09-05", today)).toBe("5 set");
    expect(formatDue("2026-12-31", today)).toBe("31 dez");
  });

  it("adds the year when it isn't the current one", () => {
    expect(formatDue("2027-01-02", today)).toBe("2 jan 2027");
  });
});

describe("memberColor", () => {
  it("always gives the same person the same color", () => {
    const id = "6f1c2a4e-0000-4000-8000-000000000001";
    expect(memberColor(id)).toBe(memberColor(id));
  });

  it("only returns colors from the palette", () => {
    for (const id of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) {
      expect(MEMBER_COLORS).toContain(memberColor(id));
    }
  });

  it("spreads different people across the palette", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `user-${i}`);
    expect(new Set(ids.map(memberColor)).size).toBeGreaterThanOrEqual(5);
  });
});
