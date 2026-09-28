import { describe, expect, it } from "vitest";
import { tipPosition } from "./tipPosition";

describe("tipPosition", () => {
  it("puts the tooltip right of the guide in the first half", () => {
    expect(tipPosition(100, 300, 600)).toEqual({ left: 110 });
  });
  it("puts it left of the guide past the middle, so it does not cover end labels", () => {
    expect(tipPosition(450, 300, 600)).toEqual({ right: 160 });
  });
  it("keeps it inside the chart", () => {
    expect(tipPosition(-20, 300, 600)).toEqual({ left: 0 });
    expect(tipPosition(620, 300, 600)).toEqual({ right: 0 });
    expect(tipPosition(200, 180, 300)).toEqual({ right: 110 });
    expect(tipPosition(160, 180, 300)).toEqual({ left: 150 });
  });
});
