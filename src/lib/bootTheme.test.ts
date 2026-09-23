import { describe, expect, it } from "vitest";
import html from "../../index.html?raw";

// index.html carries a tiny synchronous script that sets data-theme/data-accent before the
// stylesheet paints anything — the module bundle runs too late in a release build, so a
// light-theme user would see a dark frame. This runs that exact inline script in isolation.
const script = html.match(/<script id="boot-theme">([\s\S]*?)<\/script>/)?.[1];

function boot(stored: string | null | Error, prefersDark = true) {
  const dataset: Record<string, string> = { theme: "dark", accent: "purple" };
  const run = new Function("localStorage", "matchMedia", "document", script ?? "throw new Error('boot-theme script missing')");
  run(
    {
      getItem: () => {
        if (stored instanceof Error) throw stored;
        return stored;
      },
    },
    () => ({ matches: prefersDark }),
    { documentElement: { dataset } },
  );
  return dataset;
}

describe("boot-theme inline script", () => {
  it("is in index.html before the stylesheet-bearing body", () => {
    expect(script).toBeDefined();
    expect(html.indexOf('<script id="boot-theme">')).toBeLessThan(html.indexOf("<body"));
  });

  it("applies a stored light theme and accent", () => {
    expect(boot(JSON.stringify({ theme: "light", accent: "green" }))).toEqual({ theme: "light", accent: "green" });
  });

  it("resolves the system theme from the OS preference", () => {
    expect(boot(JSON.stringify({ theme: "system" }), false).theme).toBe("light");
    expect(boot(JSON.stringify({ theme: "system" }), true).theme).toBe("dark");
  });

  it("keeps the dark/purple fallback for missing, invalid or unreadable storage", () => {
    expect(boot(null)).toEqual({ theme: "dark", accent: "purple" });
    expect(boot("{oops")).toEqual({ theme: "dark", accent: "purple" });
    expect(boot(JSON.stringify({ theme: "neon", accent: "gold" }))).toEqual({ theme: "dark", accent: "purple" });
    expect(boot(new Error("storage disabled"))).toEqual({ theme: "dark", accent: "purple" });
  });
});
