import { useEffect, useState } from "react";
import { THEME_KEY, nextThemePref, parseThemePref, resolveTheme, type ThemePref } from "../lib/theme";

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function readPref(): ThemePref {
  try {
    return parseThemePref(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

/** Preferência de tema (sistema/claro/escuro), aplicada como classe `dark` no <html>. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readPref);

  useEffect(() => {
    const apply = () => document.documentElement.classList.toggle("dark", resolveTheme(pref, media().matches) === "dark");
    apply();
    try {
      localStorage.setItem(THEME_KEY, pref);
    } catch {
      // Sem storage (janela anônima restrita): o tema só vale nesta sessão.
    }
    if (pref !== "system") return;
    const mq = media();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [pref]);

  return { pref, cycle: () => setPref(nextThemePref) };
}
