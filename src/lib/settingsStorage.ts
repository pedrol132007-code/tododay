import type { ResolvedTheme, Settings } from "../types";
import { DEFAULT_SETTINGS, parseSettings, resolveTheme } from "./settings";

const STORAGE_KEY = "tododay.settings";

// Storage can throw (disabled, quota); preferences are a convenience, never a reason to crash.
export function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Keep running with the in-memory value.
  }
}

export function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applySettingsToDocument(settings: Settings, prefersDark: boolean): ResolvedTheme {
  const theme = resolveTheme(settings.theme, prefersDark);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = settings.accent;
  return theme;
}
