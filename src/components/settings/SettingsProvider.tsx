import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ResolvedTheme, Settings } from "../../types";
import { resolveTheme } from "../../lib/settings";
import { applySettingsToDocument, saveSettings, systemPrefersDark } from "../../lib/settingsStorage";

interface SettingsContextValue {
  settings: Settings;
  resolvedTheme: ResolvedTheme;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ initial, children }: { initial: Settings; children: ReactNode }) {
  const [settings, setSettings] = useState(initial);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  // Only "system" needs to hear about Windows switching modes; explicit choices ignore it.
  useEffect(() => {
    if (settings.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    setPrefersDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [settings.theme]);

  useEffect(() => {
    applySettingsToDocument(settings, prefersDark);
  }, [settings, prefersDark]);

  function update(patch: Partial<Settings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }

  return (
    <SettingsContext.Provider
      value={{ settings, resolvedTheme: resolveTheme(settings.theme, prefersDark), update }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside SettingsProvider");
  return value;
}
