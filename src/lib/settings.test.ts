import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings, resolveTheme } from "./settings";

describe("parseSettings", () => {
  it("returns defaults when nothing is stored", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults for text that is not JSON", () => {
    expect(parseSettings("{oops")).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults for JSON that is not an object", () => {
    expect(parseSettings("42")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("null")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid fields and defaults the invalid ones, field by field", () => {
    expect(parseSettings(JSON.stringify({ theme: "neon", accent: "green", compact: "yes" }))).toEqual({
      theme: "dark",
      accent: "green",
      compact: false,
    });
  });

  it("fills missing fields with defaults", () => {
    expect(parseSettings(JSON.stringify({ theme: "light" }))).toEqual({ ...DEFAULT_SETTINGS, theme: "light" });
  });

  it("reads a fully valid object", () => {
    const s = { theme: "system", accent: "orange", compact: true };
    expect(parseSettings(JSON.stringify(s))).toEqual(s);
  });
});

describe("resolveTheme", () => {
  it("returns explicit choices regardless of the system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the system when set to system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});
