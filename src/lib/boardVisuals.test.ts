import { describe, expect, it } from "vitest";
import { dueState, formatDue, memberColor, MEMBER_COLORS, wipState } from "./boardVisuals";

const today = new Date(2026, 8, 25, 15, 30); // 25/09/2026, meio da tarde

describe("dueState", () => {
  it("has no state without a due date", () => {
    expect(dueState(null, today)).toBeNull();
  });

  it("flags past dates as overdue", () => {
    expect(dueState("2026-09-24", today)).toBe("overdue");
    expect(dueState("2025-12-31", today)).toBe("overdue");
  });

  it("flags today regardless of the time of day", () => {
    expect(dueState("2026-09-25", today)).toBe("today");
    expect(dueState("2026-09-25", new Date(2026, 8, 25, 0, 1))).toBe("today");
    expect(dueState("2026-09-25", new Date(2026, 8, 25, 23, 59))).toBe("today");
  });

  it("marks future dates as upcoming", () => {
    expect(dueState("2026-09-26", today)).toBe("upcoming");
  });
});

describe("formatDue", () => {
  it("shows day and short month in Portuguese", () => {
    expect(formatDue("2026-09-05", today)).toBe("5 set");
    expect(formatDue("2026-12-31", today)).toBe("31 dez");
  });

  it("adds the year when it isn't the current one", () => {
    expect(formatDue("2027-01-02", today)).toBe("2 jan 2027");
  });
});

describe("wipState", () => {
  it("shows only the count when there is no limit", () => {
    expect(wipState(3, null)).toEqual({ label: "3", over: false });
  });

  it("shows count over limit, flagging when it is exceeded", () => {
    expect(wipState(4, 5)).toEqual({ label: "4/5", over: false });
    expect(wipState(5, 5)).toEqual({ label: "5/5", over: false });
    expect(wipState(6, 5)).toEqual({ label: "6/5", over: true });
  });

  it("treats a zero or negative limit as no limit", () => {
    expect(wipState(2, 0)).toEqual({ label: "2", over: false });
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
