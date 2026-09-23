# Configurações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba Configurações (engrenagem no canto superior direito) com tema Claro/Escuro/Automático, cor de destaque, densidade compacta, backup do banco e atalho para a pasta de dados.

**Architecture:** Preferências em `localStorage`, parseadas por funções puras testadas e aplicadas como `data-theme`/`data-accent` no `<html>` antes do primeiro render. Cores do Tailwind viram `var(--token)` definidas por tema em `index.css`. Um `SettingsProvider` expõe `useSettings()`. Backup via `VACUUM INTO` (SQL em `src/db/backup.ts`) com `plugin-dialog`; pasta via `plugin-opener`.

**Tech Stack:** Tauri v2 (+ `tauri-plugin-dialog`, `tauri-plugin-opener`), React 18, TS, Tailwind 3, vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-configuracoes-design.md`

## Global Constraints

- Worktree `C:\Users\pedro.romeiro\Desktop\projeto-equipe-status`, branch `feature/equipe-e-status`. Não tocar em `C:\Users\pedro.romeiro\Desktop\projeto`.
- SQL só em `src/db/*.ts`. Tipos em `src/types/index.ts`.
- Chave de storage: `tododay.settings`. Padrões: `theme: "dark"`, `accent: "purple"`, `compact: false`.
- Temas: `"light" | "dark" | "system"`. Destaques: `"purple" | "blue" | "green" | "pink" | "orange"`.
- Nome sugerido do backup: `tododay-backup-AAAA-MM-DD-HHMM.db`.
- Mensagem para destino existente: `Esse arquivo já existe — escolha outro nome.`
- Textos de UI em português. Commits terminam com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Rodar comandos Rust/Tauri pelo PowerShell (Git Bash sombreia `link.exe`).

## Review Focus

1. **Piscar no boot:** com tema claro salvo, a janela não pode aparecer escura antes de ficar clara — os atributos precisam estar no `<html>` antes do `render` (Task 3; manual Task 7).
2. **Storage corrompido/parcial:** `{"theme":"neon"}` ou texto não-JSON não pode quebrar o app nem zerar os campos válidos (Task 1, testes).
3. **Backup sobre arquivo existente:** mensagem amigável em vez do erro cru do SQLite (Task 1, teste de `backupErrorMessage`).
4. **Etiquetas no tema claro:** chips de etiqueta usam cor escolhida pelo usuário; o texto sobre eles não pode virar claro no tema claro (Task 2, `text-on-label` fixo; manual Task 7).
5. **Automático ao vivo:** mudar o modo do Windows com o app aberto troca o tema; sair de Automático para de ouvir (Task 3; manual Task 7).

---

### Task 1: Lógica pura de preferências e backup (TDD)

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/settings.ts`, `src/lib/settings.test.ts`
- Create: `src/lib/backup.ts`, `src/lib/backup.test.ts`

**Interfaces:**
- Produces: tipos `ThemePreference`, `ResolvedTheme`, `AccentColor`, `Settings`; `DEFAULT_SETTINGS`, `ACCENT_COLORS: AccentColor[]`, `ACCENT_LABELS: Record<AccentColor, string>`, `parseSettings(raw: string | null): Settings`, `resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme`; `backupFileName(date: Date): string`, `backupErrorMessage(error: unknown): string`.

- [ ] **Step 1: Tipos** — adicionar ao fim de `src/types/index.ts`:

```ts
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type AccentColor = "purple" | "blue" | "green" | "pink" | "orange";

export interface Settings {
  theme: ThemePreference;
  accent: AccentColor;
  compact: boolean;
}
```

- [ ] **Step 2: Testes que falham**

`src/lib/settings.test.ts`:

```ts
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
```

`src/lib/backup.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { backupErrorMessage, backupFileName } from "./backup";

describe("backupFileName", () => {
  it("formats local date and time with zero padding", () => {
    expect(backupFileName(new Date(2026, 0, 5, 9, 7))).toBe("tododay-backup-2026-01-05-0907.db");
  });

  it("formats two-digit parts as-is", () => {
    expect(backupFileName(new Date(2026, 8, 23, 15, 12))).toBe("tododay-backup-2026-09-23-1512.db");
  });
});

describe("backupErrorMessage", () => {
  it("explains the SQLite error for an existing destination", () => {
    expect(backupErrorMessage("error returned from database: (code: 1) output file already exists")).toBe(
      "Esse arquivo já existe — escolha outro nome.",
    );
    expect(backupErrorMessage(new Error("output file already exists"))).toBe(
      "Esse arquivo já existe — escolha outro nome.",
    );
  });

  it("passes other errors through with a prefix", () => {
    expect(backupErrorMessage("disk full")).toBe("Não foi possível salvar o backup: disk full");
    expect(backupErrorMessage(new Error("denied"))).toBe("Não foi possível salvar o backup: denied");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/lib/settings.test.ts src/lib/backup.test.ts`
Expected: FAIL — `Cannot find module './settings'` / `'./backup'`.

- [ ] **Step 4: Implementar**

`src/lib/settings.ts`:

```ts
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
```

`src/lib/backup.ts`:

```ts
const pad = (n: number) => String(n).padStart(2, "0");

export function backupFileName(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `tododay-backup-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.db`;
}

// VACUUM INTO refuses to overwrite; the save dialog already asked "replace?", so the raw
// SQLite text would read as a bug. Everything else is shown as-is.
export function backupErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes("output file already exists")) return "Esse arquivo já existe — escolha outro nome.";
  return `Não foi possível salvar o backup: ${text}`;
}
```

- [ ] **Step 5: Rodar e ver passar** — Run: `npm test` → PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/settings.ts src/lib/settings.test.ts src/lib/backup.ts src/lib/backup.test.ts
git commit -m "Add settings parsing, theme resolution and backup naming helpers"
```

---

### Task 2: Tokens de cor por tema

**Files:**
- Modify: `tailwind.config.ts`, `src/index.css`, `index.html`, `src/lib/status.ts`, `src/lib/status.test.ts`
- Modify (rename/tokens): `src/App.tsx`, `src/components/**/*.tsx` listados no Step 4

**Interfaces:**
- Produces: classes `bg-accent`/`text-accent`/`border-accent`/`ring-accent`, `text-on-accent`, `text-on-label`, `bg-overlay`; variáveis `--status-planned|in-progress|done`; `STATUS_COLORS` = `var(--status-...)`.

- [ ] **Step 1: Teste de status que falha** — em `src/lib/status.test.ts`, substituir o teste `"gives every status a hex color"` por:

```ts
  it("points every status at a theme variable", () => {
    expect(STATUS_COLORS).toEqual({
      planned: "var(--status-planned)",
      in_progress: "var(--status-in-progress)",
      done: "var(--status-done)",
    });
  });
```

Run: `npx vitest run src/lib/status.test.ts` → FAIL (recebe hex).

- [ ] **Step 2: `src/lib/status.ts`** — `STATUS_COLORS` vira:

```ts
// Theme-dependent (src/index.css): the dark-theme amber is unreadable on a light background.
export const STATUS_COLORS: Record<CardStatus, string> = {
  planned: "var(--status-planned)",
  in_progress: "var(--status-in-progress)",
  done: "var(--status-done)",
};
```

Run: `npx vitest run src/lib/status.test.ts` → PASS.

- [ ] **Step 3: `tailwind.config.ts`** — o bloco `colors` vira:

```ts
      colors: {
        "bg-base": "var(--bg-base)",
        "bg-surface": "var(--bg-surface)",
        "bg-elevated": "var(--bg-elevated)",
        accent: "var(--accent)",
        "on-accent": "var(--on-accent)",
        "on-label": "#16121f",
        "accent-pink": "var(--accent-pink)",
        "accent-yellow": "var(--accent-yellow)",
        "text-primary": "var(--text-primary)",
        "text-muted": "var(--text-muted)",
        border: "var(--border)",
        overlay: "var(--overlay)",
      },
```

(`on-label` é fixo: etiquetas têm a cor que o usuário escolheu, independente do tema.)

- [ ] **Step 4: Renomear e ajustar classes**

```bash
grep -rl "accent-purple" src | xargs sed -i 's/accent-purple/accent/g'
```

Depois, trocar `text-bg-base` por `text-on-accent` **apenas** onde o fundo é `bg-accent`:
`src/App.tsx` (botão Equipe), `src/components/board/BoardSwitcher.tsx:37`, `src/components/board/BoardView.tsx:435`, `src/components/board/List.tsx:137`, `src/components/card-detail/Checklist.tsx:78`, `src/components/card-detail/LabelPicker.tsx:116`, `src/components/team/TeamView.tsx:103`.
Em `src/components/card-detail/LabelPicker.tsx:44` e `:81` (chips de etiqueta), `text-bg-base` → `text-on-label`.
Os `hover:bg-accent-pink hover:text-bg-base` ficam como estão (o rosa escurece no tema claro e `bg-base` clareia — o contraste se mantém).
Em `src/components/card-detail/CardDetailPanel.tsx:48` e `src/components/search/CommandPalette.tsx:30`, `bg-black/50` → `bg-overlay`.

Conferir: `grep -rn "accent-purple\|bg-black" src` → vazio; `grep -rn "bg-accent " src | grep text-bg-base` → vazio.

- [ ] **Step 5: `src/index.css`** — depois das diretivas `@tailwind`, antes de `body`:

```css
:root,
[data-theme="dark"] {
  color-scheme: dark;
  --bg-base: #16121f;
  --bg-surface: #1f1a2e;
  --bg-elevated: #2a2340;
  --text-primary: #f2eef9;
  --text-muted: #a99fc2;
  --border: #35304a;
  --accent-pink: #f0a6c4;
  --accent-yellow: #f5d68a;
  --overlay: rgb(0 0 0 / 0.5);
  --status-planned: #a99fc2;
  --status-in-progress: #f5d68a;
  --status-done: #86efac;
  --on-accent: #16121f;
  --accent: #a78bfa;
}
[data-theme="dark"][data-accent="blue"] { --accent: #60a5fa; }
[data-theme="dark"][data-accent="green"] { --accent: #4ade80; }
[data-theme="dark"][data-accent="pink"] { --accent: #f472b6; }
[data-theme="dark"][data-accent="orange"] { --accent: #fb923c; }

[data-theme="light"] {
  color-scheme: light;
  --bg-base: #f7f5fb;
  --bg-surface: #ffffff;
  --bg-elevated: #efebf7;
  --text-primary: #1f1a2e;
  --text-muted: #6b6283;
  --border: #ddd6ea;
  --accent-pink: #d9467f;
  --accent-yellow: #b7791f;
  --overlay: rgb(31 26 46 / 0.35);
  --status-planned: #6b6283;
  --status-in-progress: #b45309;
  --status-done: #15803d;
  --on-accent: #ffffff;
  --accent: #7c3aed;
}
[data-theme="light"][data-accent="blue"] { --accent: #2563eb; }
[data-theme="light"][data-accent="green"] { --accent: #15803d; }
[data-theme="light"][data-accent="pink"] { --accent: #db2777; }
[data-theme="light"][data-accent="orange"] { --accent: #c2410c; }
```

- [ ] **Step 6: `index.html`** — `<html lang="pt-BR" class="dark">` → `<html lang="pt-BR" data-theme="dark" data-accent="purple">` (fallback até o `main.tsx` aplicar a preferência).

- [ ] **Step 7: Verificar** — `npx tsc --noEmit`, `npm test`, `npm run build` → ok. O visual escuro/roxo não muda (mesmos valores).

- [ ] **Step 8: Commit**

```bash
git add -A src tailwind.config.ts index.html
git commit -m "Move colors to per-theme CSS variables and rename accent token"
```

---

### Task 3: Storage, provider e aplicação antes do render

**Files:**
- Create: `src/lib/settingsStorage.ts`
- Create: `src/components/settings/SettingsProvider.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: Task 1.
- Produces: `loadSettings(): Settings`, `saveSettings(s: Settings): void`, `applySettingsToDocument(s: Settings, systemPrefersDark: boolean): ResolvedTheme`, `systemPrefersDark(): boolean`; `<SettingsProvider>`, `useSettings(): { settings: Settings; resolvedTheme: ResolvedTheme; update: (patch: Partial<Settings>) => void }`.

- [ ] **Step 1: `src/lib/settingsStorage.ts`**

```ts
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
```

- [ ] **Step 2: `src/components/settings/SettingsProvider.tsx`**

```tsx
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
```

- [ ] **Step 3: `src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { SettingsProvider } from "./components/settings/SettingsProvider";
import { applySettingsToDocument, loadSettings, systemPrefersDark } from "./lib/settingsStorage";
import "./index.css";

const queryClient = new QueryClient();

// Applied before the first render so a light-theme user never sees a dark flash.
const initialSettings = loadSettings();
applySettingsToDocument(initialSettings, systemPrefersDark());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SettingsProvider initial={initialSettings}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 4: Verificar** — `npx tsc --noEmit`, `npm test` → ok.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settingsStorage.ts src/components/settings/SettingsProvider.tsx src/main.tsx
git commit -m "Load and apply settings before first render, expose useSettings"
```

---

### Task 4: Modo compacto

**Files:** Modify `src/components/board/Card.tsx`, `src/components/board/List.tsx`, `src/components/ui/StatusBadge.tsx`

**Interfaces:** Consumes `useSettings()` (Task 3). `StatusBadge` ganha prop opcional `compact?: boolean`.

- [ ] **Step 1: `StatusBadge.tsx`**

```tsx
import type { CardStatus } from "../../types";
import { STATUS_COLORS, STATUS_LABELS } from "../../lib/status";

export function StatusBadge({ status, compact = false }: { status: CardStatus; compact?: boolean }) {
  const dot = <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />;
  if (compact) {
    return (
      <span className="flex items-center" title={STATUS_LABELS[status]} aria-label={STATUS_LABELS[status]}>
        {dot}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs" style={{ color: STATUS_COLORS[status] }}>
      {dot}
      {STATUS_LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 2: `Card.tsx`** — importar `import { useSettings } from "../settings/SettingsProvider";`; no corpo `const { compact } = useSettings().settings;`. O `motion.div` interno:

```tsx
        className={`flex flex-col rounded-xl border border-border bg-bg-elevated ${
          compact ? "gap-0.5 px-2 py-1 text-sm" : "gap-1 px-3 py-2"
        }`}
```

e `<StatusBadge status={card.status} />` → `<StatusBadge status={card.status} compact={compact} />`.

- [ ] **Step 3: `List.tsx`** — mesmo import/hook. O `motion.div` da coluna: `gap-3 ... p-4` → `` `flex flex-col rounded-2xl border border-border bg-bg-surface ${compact ? "gap-2 p-3" : "gap-3 p-4"}` ``; o container de cards `flex flex-col gap-2` → `` `flex flex-col ${compact ? "gap-1.5" : "gap-2"}` ``.

- [ ] **Step 4: Verificar** — `npx tsc --noEmit`, `npm test` → ok.

- [ ] **Step 5: Commit**

```bash
git add src/components/board/Card.tsx src/components/board/List.tsx src/components/ui/StatusBadge.tsx
git commit -m "Add compact card density"
```

---

### Task 5: Plugins e backup

**Files:**
- Modify: `package.json`/`package-lock.json` (npm), `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/src/main.rs`, `src-tauri/capabilities/default.json`
- Create: `src/db/backup.ts`

**Interfaces:** Produces `backupDatabase(destPath: string): Promise<void>`.

- [ ] **Step 1: Dependências**

```powershell
cd C:\Users\pedro.romeiro\Desktop\projeto-equipe-status
npm install @tauri-apps/plugin-dialog@^2.7.3 @tauri-apps/plugin-opener@^2.5.5
cd src-tauri
cargo add tauri-plugin-dialog@2 tauri-plugin-opener@2
```

- [ ] **Step 2: `main.rs`** — encadear depois do plugin SQL:

```rust
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
```

- [ ] **Step 3: `capabilities/default.json`** — `permissions` passa a:

```json
  "permissions": [
    "core:default",
    "sql:default",
    "sql:allow-load",
    "sql:allow-execute",
    "sql:allow-select",
    "sql:allow-close",
    "dialog:allow-save",
    {
      "identifier": "opener:allow-open-path",
      "allow": [{ "path": "$APPDATA" }, { "path": "$APPDATA/**" }]
    }
  ]
```

- [ ] **Step 4: `src/db/backup.ts`**

```ts
import { getDb } from "./client";

// VACUUM INTO writes a consistent snapshot (WAL included) while the app keeps the database
// open — copying the file directly could catch it mid-write.
export async function backupDatabase(destPath: string): Promise<void> {
  const db = await getDb();
  await db.execute("VACUUM INTO $1", [destPath]);
}
```

- [ ] **Step 5: Verificar** — `npx tsc --noEmit`, `npm test`; PowerShell: `cd src-tauri; cargo check` → `Finished`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/main.rs src-tauri/capabilities/default.json src/db/backup.ts
git commit -m "Add dialog and opener plugins and VACUUM INTO backup"
```

(Não incluir a alteração de fim de linha preexistente em `Cargo.toml` se ela for só CRLF — conferir com `git diff --ignore-cr-at-eol src-tauri/Cargo.toml`; o diff real deve ser só as duas dependências.)

---

### Task 6: Aba Configurações e engrenagem

**Files:**
- Create: `src/components/settings/SettingsView.tsx`
- Modify: `src/App.tsx`

**Interfaces:** Consumes Tasks 1, 3, 5. Produces `<SettingsView onBack: () => void />`; `view` com `"settings"`.

- [ ] **Step 1: `SettingsView.tsx`**

```tsx
import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { appDataDir } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import type { ThemePreference } from "../../types";
import { backupDatabase } from "../../db/backup";
import { backupErrorMessage, backupFileName } from "../../lib/backup";
import { ACCENT_COLORS, ACCENT_LABELS } from "../../lib/settings";
import { StatusBadge } from "../ui/StatusBadge";
import { useSettings } from "./SettingsProvider";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Automático" },
];

// Swatches show each accent as it looks in the current theme, so they read correctly in both.
const ACCENT_SWATCH: Record<string, { dark: string; light: string }> = {
  purple: { dark: "#a78bfa", light: "#7c3aed" },
  blue: { dark: "#60a5fa", light: "#2563eb" },
  green: { dark: "#4ade80", light: "#15803d" },
  pink: { dark: "#f472b6", light: "#db2777" },
  orange: { dark: "#fb923c", light: "#c2410c" },
};

function Segmented<T extends string | boolean>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-border bg-bg-elevated p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1 text-sm transition-colors ${
            o.value === value ? "bg-accent text-on-accent" : "text-text-muted hover:text-text-primary"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-bg-surface p-5">
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-text-muted">{label}</span>
      {children}
    </div>
  );
}

export function SettingsView({ onBack }: { onBack: () => void }) {
  const { settings, resolvedTheme, update } = useSettings();
  const [dataDir, setDataDir] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => {
    appDataDir().then(setDataDir).catch(() => setDataDir(null));
    getVersion().then(setVersion).catch(() => setVersion(null));
  }, []);

  async function handleBackup() {
    setBackupMessage(null);
    const dest = await save({
      defaultPath: backupFileName(new Date()),
      filters: [{ name: "Banco do Tododay", extensions: ["db"] }],
    });
    if (!dest) return;
    setBackingUp(true);
    try {
      await backupDatabase(dest);
      setBackupMessage({ ok: true, text: `Backup salvo em ${dest}` });
    } catch (error) {
      setBackupMessage({ ok: false, text: backupErrorMessage(error) });
    } finally {
      setBackingUp(false);
    }
  }

  async function handleOpenFolder() {
    if (!dataDir) return;
    try {
      await openPath(dataDir);
    } catch (error) {
      setBackupMessage({ ok: false, text: `Não foi possível abrir a pasta: ${String(error)}` });
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-3 py-1 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
        >
          ← Voltar
        </button>
        <h1 className="text-2xl font-semibold text-text-primary">Configurações</h1>
      </div>

      <div className="flex max-w-2xl flex-col gap-6">
        <Section title="Aparência">
          <Row label="Tema">
            <div className="flex flex-wrap items-center gap-3">
              <Segmented label="Tema" options={THEME_OPTIONS} value={settings.theme} onChange={(theme) => update({ theme })} />
              {settings.theme === "system" && (
                <span className="text-xs text-text-muted">(agora: {resolvedTheme === "dark" ? "escuro" : "claro"})</span>
              )}
            </div>
          </Row>

          <Row label="Cor de destaque">
            <div role="radiogroup" aria-label="Cor de destaque" className="flex gap-2">
              {ACCENT_COLORS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  role="radio"
                  aria-checked={settings.accent === accent}
                  aria-label={ACCENT_LABELS[accent]}
                  title={ACCENT_LABELS[accent]}
                  onClick={() => update({ accent })}
                  style={{ backgroundColor: ACCENT_SWATCH[accent][resolvedTheme] }}
                  className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-bg-surface ${
                    settings.accent === accent ? "ring-2 ring-text-primary" : ""
                  }`}
                />
              ))}
            </div>
          </Row>

          <Row label="Densidade dos cards">
            <Segmented
              label="Densidade dos cards"
              options={[
                { value: false, label: "Normal" },
                { value: true, label: "Compacto" },
              ]}
              value={settings.compact}
              onChange={(compact) => update({ compact })}
            />
            <div className="w-72 rounded-2xl border border-border bg-bg-base p-3">
              <div
                className={`flex flex-col rounded-xl border border-border bg-bg-elevated ${
                  settings.compact ? "gap-0.5 px-2 py-1 text-sm" : "gap-1 px-3 py-2"
                }`}
              >
                <span className="px-2 py-1">Exemplo de tarefa</span>
                <div className="px-2">
                  <StatusBadge status="in_progress" compact={settings.compact} />
                </div>
              </div>
            </div>
          </Row>
        </Section>

        <Section title="Dados">
          <Row label="Pasta dos dados">
            <code className="select-text break-all rounded-lg bg-bg-elevated px-2 py-1 text-xs text-text-primary">
              {dataDir ?? "—"}
            </code>
          </Row>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleBackup}
              disabled={backingUp}
              className="rounded-lg bg-accent px-3 py-1 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-50"
            >
              {backingUp ? "Salvando…" : "Fazer backup…"}
            </button>
            <button
              type="button"
              onClick={handleOpenFolder}
              disabled={!dataDir}
              className="rounded-lg border border-border px-3 py-1 text-sm text-text-primary hover:bg-bg-elevated disabled:opacity-50"
            >
              Abrir pasta dos dados
            </button>
          </div>
          {backupMessage && (
            <p className={`text-sm ${backupMessage.ok ? "text-text-muted" : "text-accent-pink"}`}>{backupMessage.text}</p>
          )}
        </Section>

        <Section title="Sobre">
          <p className="text-sm text-text-primary">Tododay{version ? ` v${version}` : ""}</p>
          <p className="text-sm text-text-muted">Seus dados ficam só neste computador.</p>
        </Section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `App.tsx`**

Import `import { SettingsView } from "./components/settings/SettingsView";`. Tipo do view: `useState<"board" | "archive" | "team" | "settings">("board")`. Em `handleSelectBoard`: `setView((v) => (v === "team" || v === "settings" ? "board" : v));`.

Barra superior: o botão "Arquivados" passa a aparecer com `activeBoard && view !== "team" && view !== "settings"`, e o lado direito vira um grupo:

```tsx
        <div className="mr-4 flex shrink-0 items-center gap-1">
          {activeBoard && view !== "team" && view !== "settings" && (
            <button
              type="button"
              onClick={() => setView((v) => (v === "archive" ? "board" : "archive"))}
              className="shrink-0 rounded-lg px-3 py-1 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            >
              {view === "archive" ? "Board" : "Arquivados"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setView((v) => (v === "settings" ? "board" : "settings"))}
            aria-label="Configurações"
            aria-pressed={view === "settings"}
            title="Configurações"
            className={`shrink-0 rounded-lg p-1.5 transition-colors ${
              view === "settings" ? "bg-accent text-on-accent" : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            }`}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
```

(substitui o bloco `{activeBoard && view !== "team" && (<button ...Arquivados...>)}` atual.)

Conteúdo principal: antes de `view === "team" ? ...`, acrescentar `view === "settings" ? <SettingsView onBack={() => setView("board")} /> :`.

- [ ] **Step 3: Verificar** — `npx tsc --noEmit`, `npm test`, `npm run build` → ok.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/SettingsView.tsx src/App.tsx
git commit -m "Add Settings view with theme, accent, density, backup and data folder"
```

---

### Task 7: Verificação no app real

- [ ] **Step 1:** Parar a instância dev da branch se estiver rodando e subir de novo (PowerShell), porta 1430:

```powershell
cd C:\Users\pedro.romeiro\Desktop\projeto-equipe-status
npm run tauri dev -- --config "$env:TEMP\tododay-dev-config.json"
```

- [ ] **Step 2: Checklist manual**
1. Engrenagem no canto superior direito abre Configurações; clicar de novo/← Voltar/um board volta.
2. Claro, Escuro, Automático: board, painel de detalhe, busca (Ctrl+K), arquivados, equipe e configurações legíveis nos dois temas; chips de etiqueta legíveis no claro.
3. 5 cores de destaque: botões e board ativo mudam; texto sobre o destaque legível nos dois temas.
4. Automático + trocar o modo do Windows (Configurações → Personalização → Cores) → app acompanha; "(agora: …)" atualiza.
5. Compacto: prévia muda; board mostra cards menores e o status só como bolinha (tooltip com o nome).
6. Fechar e reabrir com tema claro → abre claro sem piscar escuro.
7. Fazer backup para um arquivo novo → mensagem de sucesso; o arquivo abre (`python -c "import sqlite3;print(sqlite3.connect(r'<arquivo>').execute('select count(*) from card').fetchone())"`).
8. Backup sobre um arquivo existente (confirmar substituir no diálogo) → "Esse arquivo já existe — escolha outro nome."
9. Cancelar o diálogo → nenhuma mensagem.
10. "Abrir pasta dos dados" abre o Explorer em `%APPDATA%\com.pedroromeiro.tododay`.
