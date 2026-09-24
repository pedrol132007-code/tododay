export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

// Lida também pelo script inline do index.html, que aplica o tema antes do React carregar.
export const THEME_KEY = "tododay.theme";

export function parseThemePref(stored: string | null): ThemePref {
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

const CYCLE: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };

export function nextThemePref(pref: ThemePref): ThemePref {
  return CYCLE[pref];
}
