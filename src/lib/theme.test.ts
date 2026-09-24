import { describe, expect, it } from "vitest";
import { nextThemePref, parseThemePref, resolveTheme } from "./theme";

describe("parseThemePref", () => {
  it("keeps valid stored values", () => {
    expect(parseThemePref("light")).toBe("light");
    expect(parseThemePref("dark")).toBe("dark");
    expect(parseThemePref("system")).toBe("system");
  });

  it("defaults to system for missing or unknown values", () => {
    expect(parseThemePref(null)).toBe("system");
    expect(parseThemePref("roxo")).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("follows the OS when the preference is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("ignores the OS when the preference is explicit", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("nextThemePref", () => {
  it("cycles system → light → dark → system", () => {
    expect(nextThemePref("system")).toBe("light");
    expect(nextThemePref("light")).toBe("dark");
    expect(nextThemePref("dark")).toBe("system");
  });
});
