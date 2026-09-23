import type { AccentColor, ResolvedTheme, Settings, ThemePreference } from "../types";

export const DEFAULT_SETTINGS: Settings = { theme: "dark", accent: "purple", compact: false };

export const THEME_PREFERENCES: ThemePreference[] = ["light", "dark", "system"];

export const ACCENT_COLORS: AccentColor[] = ["purple", "blue", "green", "pink", "orange"];

export const ACCENT_LABELS: Record<AccentColor, string> = {
  purple: "Roxo",
  blue: "Azul",
  green: "Verde",
  pink: "Rosa",
  orange: "Laranja",
};

// Whatever is in storage may come from an older version or be hand-edited; each field falls
// back to its default on its own, so one bad value never wipes the others.
export function parseSettings(raw: string | null): Settings {
  if (raw === null) return DEFAULT_SETTINGS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (typeof data !== "object" || data === null) return DEFAULT_SETTINGS;
  const obj = data as Record<string, unknown>;
  return {
    theme: THEME_PREFERENCES.includes(obj.theme as ThemePreference)
      ? (obj.theme as ThemePreference)
      : DEFAULT_SETTINGS.theme,
    accent: ACCENT_COLORS.includes(obj.accent as AccentColor) ? (obj.accent as AccentColor) : DEFAULT_SETTINGS.accent,
    compact: typeof obj.compact === "boolean" ? obj.compact : DEFAULT_SETTINGS.compact,
  };
}

export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === "system") return systemPrefersDark ? "dark" : "light";
  return pref;
}
