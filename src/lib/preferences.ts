// Preferências da instalação (não do usuário no banco): ficam no localStorage deste navegador/app.

export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";
export type Density = "normal" | "compact";

// Lida também pelo script inline do index.html, que aplica o tema antes do React carregar.
export const THEME_KEY = "tododay.theme";
export const DENSITY_KEY = "tododay.density";

export function parseThemePref(stored: string | null): ThemePref {
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

export function parseDensity(stored: string | null): Density {
  return stored === "compact" ? "compact" : "normal";
}
