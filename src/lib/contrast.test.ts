import { describe, expect, it } from "vitest";
import { readableTextOn } from "./contrast";

describe("readableTextOn", () => {
  it("uses white text on dark colors", () => {
    expect(readableTextOn("#2538ff")).toBe("#ffffff");
    expect(readableTextOn("#e51e47")).toBe("#ffffff");
    expect(readableTextOn("#1a1e21")).toBe("#ffffff");
  });

  it("uses dark text on light colors", () => {
    expect(readableTextOn("#fba747")).toBe("#1a1e21");
    expect(readableTextOn("#f8f5f1")).toBe("#1a1e21");
    expect(readableTextOn("#a78bfa")).toBe("#1a1e21");
  });

  it("accepts uppercase and 3-digit hex", () => {
    expect(readableTextOn("#FFF")).toBe("#1a1e21");
    expect(readableTextOn("#000")).toBe("#ffffff");
  });

  it("falls back to dark text on anything it can't parse", () => {
    expect(readableTextOn("roxo")).toBe("#1a1e21");
  });
});
