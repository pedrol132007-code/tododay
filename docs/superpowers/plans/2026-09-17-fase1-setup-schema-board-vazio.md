# Fase 1 — Setup, Schema/Migrations e Board Vazio Renderizando — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Tauri v2 + React + TypeScript + Tailwind project, wire SQLite via `@tauri-apps/plugin-sql` with a versioned migration containing the full schema, and render a single seeded board (with no lists yet) end-to-end through the real stack.

**Architecture:** Vite/React frontend talks to SQLite only through `src/db/*.ts` (no SQL in components). A `Migration` embedded in the Rust `main.rs` applies `src-tauri/migrations/0001_init.sql` on first launch. React Query fetches the board list; a single `BoardView` component renders the seeded board's name and an empty "no lists yet" placeholder, styled with the dark purple/yellow theme and a light `framer-motion` fade-in.

**Tech Stack:** Tauri v2 (Rust), React 18, TypeScript, Vite, Tailwind CSS, `@tauri-apps/plugin-sql` (SQLite), TanStack Query, `framer-motion`.

**Spec:** `docs/superpowers/specs/2026-09-17-kanban-desktop-design.md`

## Global Constraints

- Node.js, npm and Rust/Cargo are **not installed** on this machine, and installing them requires admin rights the user doesn't have readily available. Every step below that would normally run `npm install`, `npm run …`, or `cargo …` **cannot be executed yet**. Write all files with fully correct, final content as if they will be run immediately — do not leave anything half-done waiting for a "run" step to confirm it. Steps that say "Run: …" should be treated as documentation of the exact command to run later, not as something to execute now. Task 7 collects all of these into one ordered manual verification checklist for when the toolchain is available.
- No SQL in React components — all queries live in `src/db/*.ts` (per spec).
- TypeScript types in `src/types/index.ts` are the single source of truth and must mirror `src-tauri/migrations/0001_init.sql` exactly.
- SQLite boolean columns (`INTEGER` 0/1) are converted to real `boolean` in the `src/db/` layer — not exposed as raw integers to the rest of the app (not exercised yet in Phase 1, `checklist_item.done` is unused until Phase 5, but the convention is recorded now in CLAUDE.md so it isn't reinvented differently later).
- Dark theme only, Tailwind color tokens from the spec (`bg-base`, `bg-surface`, `bg-elevated`, `accent-purple`, `accent-pink`, `accent-yellow`, `text-primary`, `text-muted`, `border`), `rounded-xl`/`rounded-2xl` corners, `Manrope` font.
- YAGNI: only install dependencies this phase actually uses. `@dnd-kit/*` (Phase 3), `react-markdown`/`remark-gfm` (Phase 4) are **not** added yet.

---

### Task 1: Frontend scaffold (Vite + React + TS + Tailwind)

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `index.html`
- Create: `src/index.css`
- Create: `src/main.tsx`
- Create: `.gitignore`

**Interfaces:**
- Produces: Tailwind color tokens (`bg-base`, `bg-surface`, `bg-elevated`, `accent-purple`, `accent-pink`, `accent-yellow`, `text-primary`, `text-muted`, `border`) and `font-sans` (Manrope) usable as Tailwind classes by every later component. Vite dev server on port `1420` (required to match `src-tauri/tauri.conf.json` in Task 2).

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "kanban-pessoal",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.59.0",
    "@tauri-apps/api": "^2.1.1",
    "@tauri-apps/plugin-sql": "^2.0.1",
    "framer-motion": "^11.11.9",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.1.0",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3",
    "vite": "^5.4.9"
  }
}
```

- [ ] **Step 2: Write `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Write `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Write `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "bg-base": "#16121f",
        "bg-surface": "#1f1a2e",
        "bg-elevated": "#2a2340",
        "accent-purple": "#a78bfa",
        "accent-pink": "#f0a6c4",
        "accent-yellow": "#f5d68a",
        "text-primary": "#f2eef9",
        "text-muted": "#a99fc2",
        border: "#35304a",
      },
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 6: Write `postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 7: Write `index.html`**

```html
<!doctype html>
<html lang="pt-BR" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Kanban Pessoal</title>
  </head>
  <body class="bg-bg-base text-text-primary font-sans">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Write `src/index.css`**

```css
@import url("https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap");

@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
}
```

Note: the Manrope import is best-effort (needs internet on first load); the Tailwind fallback stack (`ui-sans-serif, system-ui, sans-serif`) keeps the UI fully usable offline, just without the custom font.

- [ ] **Step 9: Write `src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 10: Write `.gitignore`**

```
node_modules/
dist/
src-tauri/target/
src-tauri/gen/
*.db
*.db-journal
.DS_Store
```

- [ ] **Step 11: Commit**

```bash
git add package.json vite.config.ts tsconfig.json tsconfig.node.json tailwind.config.ts postcss.config.js index.html src/index.css src/main.tsx .gitignore
git commit -m "Scaffold Vite + React + TS + Tailwind frontend"
```

---

### Task 2: Tauri backend scaffold + SQLite schema/migration wiring

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/migrations/0001_init.sql`
- Create: `src-tauri/icons/icon.png` (via PowerShell, not hand-written text)

**Interfaces:**
- Consumes: Vite dev server at `http://localhost:1420` (Task 1).
- Produces: SQLite database `kanban.db` (in the Tauri app data dir) with tables `board`, `list`, `card`, `label`, `card_label`, `checklist_item` and indexes, seeded with one row in `board` (`name = 'Meu Board'`). Exposed to the frontend as connection string `"sqlite:kanban.db"`, used by `src/db/client.ts` in Task 4.

- [ ] **Step 1: Write `src-tauri/Cargo.toml`**

```toml
[package]
name = "kanban-pessoal"
version = "0.1.0"
description = "Kanban pessoal offline-first"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: Write `src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 3: Write `src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Kanban Pessoal",
  "version": "0.1.0",
  "identifier": "com.pedroromeiro.kanban",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Kanban Pessoal",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/icon.png"]
  }
}
```

- [ ] **Step 4: Write `src-tauri/capabilities/default.json`**

Tauri v2 denies plugin calls by default; the window needs explicit permission to use `plugin-sql`.

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default permissions for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "sql:default",
    "sql:allow-load",
    "sql:allow-execute",
    "sql:allow-select",
    "sql:allow-close"
  ]
}
```

- [ ] **Step 5: Write `src-tauri/migrations/0001_init.sql`**

```sql
CREATE TABLE board (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  position REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position REAL NOT NULL,
  wip_limit INTEGER
);

CREATE TABLE card (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL REFERENCES list(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position REAL NOT NULL,
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);

CREATE TABLE label (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE card_label (
  card_id INTEGER NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES label(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);

CREATE TABLE checklist_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL
);

CREATE INDEX idx_list_board ON list(board_id);
CREATE INDEX idx_card_list ON card(list_id);
CREATE INDEX idx_card_archived ON card(archived_at);
CREATE INDEX idx_checklist_card ON checklist_item(card_id);

INSERT INTO board (name, position) VALUES ('Meu Board', 1);
```

- [ ] **Step 6: Write `src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_sql::{Migration, MigrationKind};

fn main() {
    let migrations = vec![Migration {
        version: 1,
        description: "init_schema",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:kanban.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 7: Generate a placeholder app icon (runs now — pure .NET, no Node/Rust needed)**

Run in PowerShell from the project root:

```powershell
New-Item -ItemType Directory -Force src-tauri/icons | Out-Null
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(167, 139, 250))
$bmp.Save("src-tauri/icons/icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
```

Expected: `src-tauri/icons/icon.png` exists, a solid purple 256x256 PNG. This is a temporary placeholder — once the toolchain is installed, replace it with a real icon via `npm run tauri icon <path-to-source-image>` (documented in CLAUDE.md, Task 6).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/build.rs src-tauri/tauri.conf.json src-tauri/capabilities/default.json src-tauri/migrations/0001_init.sql src-tauri/src/main.rs src-tauri/icons/icon.png
git commit -m "Scaffold Tauri backend with SQLite schema and migration"
```

---

### Task 3: TypeScript types (single source of truth)

**Files:**
- Create: `src/types/index.ts`

**Interfaces:**
- Consumes: column names/types from `src-tauri/migrations/0001_init.sql` (Task 2).
- Produces: `Board`, `List`, `Card`, `Label`, `CardLabel`, `ChecklistItem` types, imported by every file in `src/db/` and `src/components/` from here on.

- [ ] **Step 1: Write `src/types/index.ts`**

```ts
export interface Board {
  id: number;
  name: string;
  position: number;
  created_at: string;
}

export interface List {
  id: number;
  board_id: number;
  name: string;
  position: number;
  wip_limit: number | null;
}

export interface Card {
  id: number;
  list_id: number;
  title: string;
  description: string;
  position: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface Label {
  id: number;
  board_id: number;
  name: string;
  color: string;
}

export interface CardLabel {
  card_id: number;
  label_id: number;
}

export interface ChecklistItem {
  id: number;
  card_id: number;
  text: string;
  done: boolean;
  position: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "Add TypeScript types mirroring the SQL schema"
```

---

### Task 4: DB client + boards query layer

**Files:**
- Create: `src/db/client.ts`
- Create: `src/db/boards.ts`

**Interfaces:**
- Consumes: `Board` type (Task 3), connection string `"sqlite:kanban.db"` (Task 2).
- Produces: `getDb(): Promise<Database>` and `listBoards(): Promise<Board[]>`, used by `src/hooks/useBoards.ts` (Task 5).

- [ ] **Step 1: Write `src/db/client.ts`**

```ts
import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:kanban.db");
  }
  return db;
}
```

- [ ] **Step 2: Write `src/db/boards.ts`**

```ts
import { getDb } from "./client";
import type { Board } from "../types";

export async function listBoards(): Promise<Board[]> {
  const db = await getDb();
  return db.select<Board[]>("SELECT * FROM board ORDER BY position ASC");
}
```

- [ ] **Step 3: Commit**

```bash
git add src/db/client.ts src/db/boards.ts
git commit -m "Add SQLite client and boards query layer"
```

---

### Task 5: React Query hook + empty board UI

**Files:**
- Create: `src/hooks/useBoards.ts`
- Create: `src/components/board/BoardView.tsx`
- Modify: `src/App.tsx` (create it — first real content, Task 1 only created `main.tsx`)

**Interfaces:**
- Consumes: `listBoards` (Task 4), `Board` type (Task 3).
- Produces: `useBoards()` hook (`{ data, isLoading, error }` from TanStack Query) and `<BoardView />`, rendered by `<App />`.

- [ ] **Step 1: Write `src/hooks/useBoards.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { listBoards } from "../db/boards";

export function useBoards() {
  return useQuery({
    queryKey: ["boards"],
    queryFn: listBoards,
  });
}
```

- [ ] **Step 2: Write `src/components/board/BoardView.tsx`**

```tsx
import { motion } from "framer-motion";
import { useBoards } from "../../hooks/useBoards";

export function BoardView() {
  const { data: boards, isLoading, error } = useBoards();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        Carregando...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-accent-pink">
        Erro ao carregar boards: {(error as Error).message}
      </div>
    );
  }

  const board = boards?.[0];

  if (!board) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        Nenhum board ainda.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex h-full flex-col p-6"
    >
      <h1 className="text-2xl font-semibold text-text-primary">{board.name}</h1>
      <div className="mt-6 flex-1 rounded-2xl border border-border bg-bg-surface p-6 text-text-muted">
        Nenhuma lista ainda.
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 3: Write `src/App.tsx`**

```tsx
import { BoardView } from "./components/board/BoardView";

export default function App() {
  return (
    <div className="h-screen w-screen overflow-hidden">
      <BoardView />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useBoards.ts src/components/board/BoardView.tsx src/App.tsx
git commit -m "Render seeded board through React Query end-to-end"
```

---

### Task 6: CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by code; read by future Claude Code sessions and by the user.

- [ ] **Step 1: Write `CLAUDE.md`**

```markdown
# CLAUDE.md

Kanban pessoal desktop — single-user, offline-first, sem nuvem. Tauri v2 (Rust) + React 18 + TypeScript + Vite + Tailwind + SQLite (`@tauri-apps/plugin-sql`).

## Convenções

- Toda query SQL vive em `src/db/*.ts`. Nunca escreva SQL dentro de componentes React.
- `src/types/index.ts` é a única fonte de verdade dos tipos TS e espelha exatamente as colunas de `src-tauri/migrations/`. Ao mudar uma migration, atualize os tipos no mesmo commit.
- Colunas booleanas no SQLite são `INTEGER` 0/1 (ex: `checklist_item.done`); a camada `src/db/` converte para `boolean` antes de expor ao resto do app — nunca exponha `0`/`1` cru fora de `src/db/`.
- Migrations são arquivos numerados sequenciais em `src-tauri/migrations/` (`0001_*.sql`, `0002_*.sql`, ...). Nunca edite uma migration já commitada — crie uma nova.
- Posições (`position`) são `REAL`. Inserir no fim de uma lista: `MAX(position) + 1`. Reordenar entre dois itens existentes: média dos vizinhos, com rebalanceamento ocasional (`src/lib/position.ts`, a partir da Fase 3).
- Sem abstrações antecipadas — resolva o problema da fase atual, não o hipotético da próxima.
- Fora de escopo por enquanto: colaboração, comentários, anexos, notificações, integrações externas, mobile.

## Modelo de dados

Ver `src-tauri/migrations/0001_init.sql` (fonte autoritativa). Resumo:

- `board(id, name, position, created_at)`
- `list(id, board_id, name, position, wip_limit)`
- `card(id, list_id, title, description, position, due_date, created_at, updated_at, archived_at)`
- `label(id, board_id, name, color)`
- `card_label(card_id, label_id)` — chave composta
- `checklist_item(id, card_id, text, done, position)`

## Como rodar em dev

Pré-requisitos (uma vez só):

1. [Node.js LTS](https://nodejs.org)
2. Rust via [rustup](https://rustup.rs)
3. Windows: WebView2 Runtime (já vem no Windows 11) + Microsoft C++ Build Tools (workload "Desktop development with C++", via Visual Studio Installer)

Depois:

```bash
npm install
npm run tauri dev
```

Isso abre a janela do app com hot-reload do frontend. O banco SQLite (`kanban.db`) é criado automaticamente no diretório de dados do app na primeira execução, com o schema aplicado pelas migrations.

Para gerar os ícones definitivos do app (o placeholder atual é um quadrado roxo sólido):

```bash
npm run tauri icon caminho/para/uma/imagem.png
```

## Fases do projeto

1. Setup do projeto + schema + migrations + board vazio renderizando
2. CRUD de colunas e cards, sem drag and drop
3. Drag and drop
4. Painel de detalhe do card
5. Busca, labels, checklist, arquivamento

Spec completo: `docs/superpowers/specs/2026-09-17-kanban-desktop-design.md`
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Add CLAUDE.md with conventions, data model, and dev setup"
```

---

### Task 7: Manual end-to-end verification (run once the toolchain is installed)

**Files:** none (checklist only).

**Interfaces:** none.

- [ ] **Step 1: Install dependencies**

```bash
npm install
```
Expected: `node_modules/` created, no errors.

- [ ] **Step 2: Launch the app**

```bash
npm run tauri dev
```
Expected: a native window titled "Kanban Pessoal" opens (dark purple background), first compile takes a few minutes (Rust), then hot-reloads on frontend changes.

- [ ] **Step 3: Confirm the seeded board renders**

Expected in the window: heading "Meu Board", and below it a rounded card-like panel with the text "Nenhuma lista ainda." No console errors in the webview devtools (right-click → Inspect, or `Ctrl+Shift+I`).

- [ ] **Step 4: Confirm the SQLite file was created**

Check the app data directory (Windows: `%APPDATA%/com.pedroromeiro.kanban/`) for `kanban.db`. Optionally inspect it with any SQLite browser to confirm the `board` table has one row (`Meu Board`) and the other five tables exist and are empty.

- [ ] **Step 5: Report back**

Tell me what you saw (window opened / errors / anything that didn't match). If everything matches, Phase 1 is done and we move to Phase 2 (CRUD de colunas e cards).
