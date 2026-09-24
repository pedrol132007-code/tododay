import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  DENSITY_KEY,
  THEME_KEY,
  parseDensity,
  parseThemePref,
  resolveTheme,
  type Density,
  type Theme,
  type ThemePref,
} from "../lib/preferences";

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sem storage (janela anônima restrita): a preferência só vale nesta sessão.
  }
}

interface PreferencesValue {
  themePref: ThemePref;
  /** Tema efetivo, já resolvendo "system" pelo modo do sistema operacional. */
  theme: Theme;
  density: Density;
  setThemePref: (pref: ThemePref) => void;
  setDensity: (density: Density) => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [themePref, setThemePref] = useState(() => parseThemePref(read(THEME_KEY)));
  const [density, setDensity] = useState(() => parseDensity(read(DENSITY_KEY)));
  const [systemDark, setSystemDark] = useState(() => media().matches);

  useEffect(() => {
    if (themePref !== "system") return;
    const mq = media();
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [themePref]);

  const theme = resolveTheme(themePref, systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => write(THEME_KEY, themePref), [themePref]);
  useEffect(() => write(DENSITY_KEY, density), [density]);

  return (
    <PreferencesContext.Provider value={{ themePref, theme, density, setThemePref, setDensity }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences precisa estar dentro de PreferencesProvider");
  return value;
}

export const useCompact = () => usePreferences().density === "compact";
