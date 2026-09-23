import { describe, expect, it } from "vitest";
import { MEMBER_COLORS, nextMemberColor } from "./memberColors";

describe("nextMemberColor", () => {
  it("returns the first palette color when nobody has one", () => {
    expect(nextMemberColor([])).toBe(MEMBER_COLORS[0]);
  });

  it("skips colors already in use", () => {
    expect(nextMemberColor([MEMBER_COLORS[0], MEMBER_COLORS[1]])).toBe(MEMBER_COLORS[2]);
  });

  it("fills a gap left by a deleted member", () => {
    expect(nextMemberColor([MEMBER_COLORS[0], MEMBER_COLORS[2]])).toBe(MEMBER_COLORS[1]);
  });

  it("matches used colors case-insensitively", () => {
    expect(nextMemberColor([MEMBER_COLORS[0].toUpperCase()])).toBe(MEMBER_COLORS[1]);
  });

  it("cycles through the palette once every color is taken", () => {
    const all = [...MEMBER_COLORS];
    expect(nextMemberColor(all)).toBe(MEMBER_COLORS[all.length % MEMBER_COLORS.length]);
    expect(nextMemberColor([...all, MEMBER_COLORS[0]])).toBe(MEMBER_COLORS[1]);
  });
});
