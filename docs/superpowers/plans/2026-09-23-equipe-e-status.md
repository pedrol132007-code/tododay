# Equipe e status de tarefas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba Equipe (membros locais com cor + resumo de status) aberta por um ícone no topo esquerdo; status fixo por card (Planejada / Em processo / Finalizada) escolhido na criação; "pedido por" um membro em cada card.

**Architecture:** Migration `0002` cria `member` e adiciona `card.status` / `card.requested_by`. SQL novo em `src/db/members.ts` e `src/db/cards.ts`; hooks React Query em `src/hooks/useMembers.ts`. UI: `App` troca `showArchive` por `view`, `TeamView` novo, chips de status + select de membro reaproveitados na criação do card e no painel de detalhe.

**Tech Stack:** Tauri v2, React 18, TypeScript, Tailwind, `@tauri-apps/plugin-sql` (SQLite), TanStack Query v5, vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-equipe-e-status-design.md`

## Global Constraints

- Todo SQL em `src/db/*.ts`; nenhum SQL em componente.
- `src/types/index.ts` espelha as colunas das migrations; mudar migration e tipos no mesmo commit.
- Nunca editar `0001_init.sql`; mudanças vão em `0002_members_status.sql`.
- `position` REAL; inserir no fim = `MAX(position) + 1`.
- Status válidos: `'planned' | 'in_progress' | 'done'`; rótulos "Planejada", "Em processo", "Finalizada".
- Membros são globais (sem `board_id`).
- `deleteMember` limpa `card.requested_by` explicitamente (FKs estão desligadas; não ligar `PRAGMA foreign_keys` aqui).
- Textos de UI em português.
- Trabalho no worktree `C:\Users\pedro.romeiro\Desktop\projeto-equipe-status`, branch `feature/equipe-e-status`. Não tocar no checkout `C:\Users\pedro.romeiro\Desktop\projeto` (outra sessão usa).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Banco real do usuário:** rodar a branch em dev não pode aplicar a migration 2 no `%APPDATA%\com.pedroromeiro.tododay\kanban.db` — senão o Tododay 1.0.0 instalado (que só conhece a migration 1) passa a falhar ao abrir o banco. Builds de debug usam `kanban-dev.db` (Task 1).
2. **Limpar campo opcional de membro:** apagar função/contato/observações tem que funcionar, e um campo vazio tem que continuar clicável (placeholder). `InlineEditableText` hoje ignora valor vazio e renderiza nada (Task 5, verificação manual).
3. **Excluir membro com cards arquivados:** o `UPDATE` que zera `requested_by` não filtra `archived_at`, senão restaurar o card traz um id de membro inexistente (Task 3; verificação manual na Task 8).
4. **Board sem cards no resumo:** aparece com zeros (LEFT JOIN), não some da tabela (Task 3; manual na Task 8).
5. **Paleta esgotada:** com mais membros que cores, `nextMemberColor` continua devolvendo uma cor válida (Task 2, teste unitário).

---

## File Structure

- Create `src-tauri/migrations/0002_members_status.sql` — schema novo.
- Modify `src-tauri/src/main.rs` — registra migration 2; URL do banco por perfil de build.
- Modify `src/db/client.ts` — URL do banco por modo (dev/prod).
- Modify `src/types/index.ts` — `CardStatus`, `Member`, campos novos em `Card`, tipos de resumo.
- Create `src/lib/status.ts` (+ `status.test.ts`) — rótulos, ordem e cores dos status.
- Create `src/lib/memberColors.ts` (+ `memberColors.test.ts`) — paleta e `nextMemberColor`.
- Create `src/db/members.ts` — CRUD de membro + queries de resumo.
- Modify `src/db/cards.ts` — `createCard` com status/requestedBy, `updateCardStatus`, `updateCardRequestedBy`.
- Create `src/hooks/useMembers.ts` — hooks de membro e resumo.
- Modify `src/hooks/useCards.ts` — `useCreateCard` com objeto, hooks de status/requested_by.
- Modify `src/components/ui/InlineEditableText.tsx` — `placeholder` e `allowEmpty` opcionais.
- Create `src/components/ui/StatusPicker.tsx`, `src/components/ui/MemberSelect.tsx`, `src/components/ui/StatusBadge.tsx`.
- Modify `src/components/board/List.tsx`, `Card.tsx`, `BoardView.tsx` — criação e selos.
- Modify `src/components/card-detail/CardDetailPanel.tsx` — edição de status e pedido por.
- Create `src/components/team/TeamView.tsx`, `src/components/team/MemberCard.tsx`.
- Modify `src/App.tsx` — `view` + botão Equipe.

---

### Task 1: Migration, tipos e banco de dev separado

**Files:**
- Create: `src-tauri/migrations/0002_members_status.sql`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/db/client.ts`
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: tipos `CardStatus`, `Member`, `StatusCounts`, `BoardStatusSummary`, `MemberRequestStats`; `Card.status`, `Card.requested_by`.

- [ ] **Step 1: Preparar o worktree**

```bash
cd /c/Users/pedro.romeiro/Desktop/projeto-equipe-status
npm install
cd src-tauri && rustup override set stable-x86_64-pc-windows-gnu && cd ..
```

(O override do rustup é por diretório; o do checkout original não vale aqui.)

- [ ] **Step 2: Criar a migration**

`src-tauri/migrations/0002_members_status.sql`:

```sql
CREATE TABLE member (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  position REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE card ADD COLUMN status TEXT NOT NULL DEFAULT 'planned'
  CHECK (status IN ('planned', 'in_progress', 'done'));
ALTER TABLE card ADD COLUMN requested_by INTEGER REFERENCES member(id);

CREATE INDEX idx_card_requested_by ON card(requested_by);
```

- [ ] **Step 3: Registrar a migration e separar o banco de dev em `main.rs`**

Substituir o bloco `let migrations = vec![...]` e a chamada `.add_migrations(...)` por:

```rust
    let migrations = vec![
        Migration {
            version: 1,
            description: "init_schema",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "members_status",
            sql: include_str!("../migrations/0002_members_status.sql"),
            kind: MigrationKind::Up,
        },
    ];

    // Dev builds get their own database file so running an unmerged branch never applies
    // its migrations to the real kanban.db the installed app depends on.
    let db_url = if cfg!(debug_assertions) {
        "sqlite:kanban-dev.db"
    } else {
        "sqlite:kanban.db"
    };
```

e `.add_migrations("sqlite:kanban.db", migrations)` vira `.add_migrations(db_url, migrations)`.

- [ ] **Step 4: Mesma URL no front (`src/db/client.ts`)**

```ts
import Database from "@tauri-apps/plugin-sql";

// Must match the URL main.rs registers migrations for (kanban-dev.db in debug builds).
const DB_URL = import.meta.env.DEV ? "sqlite:kanban-dev.db" : "sqlite:kanban.db";

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}
```

O projeto ainda não referencia os tipos do Vite, então `import.meta.env` não compila. Criar `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

Atualizar a documentação do banco: em `CLAUDE.md` (seção "Como rodar em dev") e `README.md` (onde descreve o `kanban.db` do dev), acrescentar a frase: "Em `npm run tauri dev` o app usa `kanban-dev.db` (mesmo diretório), separado do `kanban.db` do app instalado."

- [ ] **Step 5: Tipos (`src/types/index.ts`)**

Adicionar antes de `export interface Card`:

```ts
export type CardStatus = "planned" | "in_progress" | "done";
```

Em `Card`, depois de `archived_at: string | null;`:

```ts
  status: CardStatus;
  requested_by: number | null;
```

Adicionar no fim do arquivo:

```ts
export interface Member {
  id: number;
  name: string;
  role: string;
  contact: string;
  notes: string;
  color: string;
  position: number;
  created_at: string;
}

export type StatusCounts = Record<CardStatus, number>;

export interface BoardStatusSummary extends StatusCounts {
  board_id: number;
  board_name: string;
}

export interface MemberRequestStats extends StatusCounts {
  member_id: number;
}
```

- [ ] **Step 6: Verificar compilação**

Run: `npx tsc --noEmit` → sem erros.
Run: `cd src-tauri && cargo check` → `Finished` (o primeiro build do worktree demora).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/migrations/0002_members_status.sql src-tauri/src/main.rs src/db/client.ts src/vite-env.d.ts src/types/index.ts CLAUDE.md README.md
git commit -m "Add member table and card status/requested_by columns

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Rótulos de status e paleta de membros (TDD)

**Files:**
- Create: `src/lib/status.ts`, `src/lib/status.test.ts`
- Create: `src/lib/memberColors.ts`, `src/lib/memberColors.test.ts`

**Interfaces:**
- Consumes: `CardStatus` (Task 1).
- Produces: `CARD_STATUSES: CardStatus[]`, `STATUS_LABELS: Record<CardStatus, string>`, `STATUS_COLORS: Record<CardStatus, string>`, `MEMBER_COLORS: string[]`, `nextMemberColor(usedColors: string[]): string`.

- [ ] **Step 1: Testes que falham**

`src/lib/status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CARD_STATUSES, STATUS_COLORS, STATUS_LABELS } from "./status";

describe("card statuses", () => {
  it("lists the three statuses in workflow order", () => {
    expect(CARD_STATUSES).toEqual(["planned", "in_progress", "done"]);
  });

  it("labels every status in Portuguese", () => {
    expect(STATUS_LABELS).toEqual({
      planned: "Planejada",
      in_progress: "Em processo",
      done: "Finalizada",
    });
  });

  it("gives every status a hex color", () => {
    for (const status of CARD_STATUSES) {
      expect(STATUS_COLORS[status]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
```

`src/lib/memberColors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MEMBER_COLORS, nextMemberColor } from "./memberColors";

describe("nextMemberColor", () => {
  it("returns the first palette color when nobody has one", () => {
    expect(nextMemberColor([])).toBe(MEMBER_COLORS[0]);
  });

  it("skips colors already in use", () => {
    expect(nextMemberColor([MEMBER_COLORS[0], MEMBER_COLORS[1]])).toBe(MEMBER_COLORS[2]);
  });

  it("fills a gap left by a deleted member", () => {
    expect(nextMemberColor([MEMBER_COLORS[0], MEMBER_COLORS[2]])).toBe(MEMBER_COLORS[1]);
  });

  it("matches used colors case-insensitively", () => {
    expect(nextMemberColor([MEMBER_COLORS[0].toUpperCase()])).toBe(MEMBER_COLORS[1]);
  });

  it("cycles through the palette once every color is taken", () => {
    const all = [...MEMBER_COLORS];
    expect(nextMemberColor(all)).toBe(MEMBER_COLORS[all.length % MEMBER_COLORS.length]);
    expect(nextMemberColor([...all, MEMBER_COLORS[0]])).toBe(MEMBER_COLORS[1]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/status.test.ts src/lib/memberColors.test.ts`
Expected: FAIL — `Failed to resolve import "./status"` / `"./memberColors"`.

- [ ] **Step 3: Implementar**

`src/lib/status.ts`:

```ts
import type { CardStatus } from "../types";

export const CARD_STATUSES: CardStatus[] = ["planned", "in_progress", "done"];

export const STATUS_LABELS: Record<CardStatus, string> = {
  planned: "Planejada",
  in_progress: "Em processo",
  done: "Finalizada",
};

export const STATUS_COLORS: Record<CardStatus, string> = {
  planned: "#a99fc2",
  in_progress: "#f5d68a",
  done: "#86efac",
};
```

`src/lib/memberColors.ts`:

```ts
// Picked to read well on the app's dark purple background and to stay distinct from each
// other; status colors (src/lib/status.ts) are deliberately not in this list.
export const MEMBER_COLORS = [
  "#60a5fa",
  "#f472b6",
  "#34d399",
  "#fb923c",
  "#c084fc",
  "#22d3ee",
  "#f87171",
  "#a3e635",
  "#e879f9",
  "#fbbf24",
];

export function nextMemberColor(usedColors: string[]): string {
  const used = new Set(usedColors.map((c) => c.toLowerCase()));
  const free = MEMBER_COLORS.find((c) => !used.has(c));
  return free ?? MEMBER_COLORS[usedColors.length % MEMBER_COLORS.length];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS (todos, incluindo `position.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/status.ts src/lib/status.test.ts src/lib/memberColors.ts src/lib/memberColors.test.ts
git commit -m "Add card status labels and member color palette

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Camada de dados e hooks

**Files:**
- Create: `src/db/members.ts`
- Modify: `src/db/cards.ts`
- Create: `src/hooks/useMembers.ts`
- Modify: `src/hooks/useCards.ts`

**Interfaces:**
- Consumes: tipos da Task 1.
- Produces:
  - `getMembers(): Promise<Member[]>`
  - `createMember(name: string, color: string): Promise<number>`
  - `updateMember(id: number, patch: MemberPatch): Promise<void>` com `type MemberPatch = Partial<Pick<Member, "name" | "role" | "contact" | "notes" | "color">>`
  - `deleteMember(id: number): Promise<void>`
  - `getStatusSummaryByBoard(): Promise<BoardStatusSummary[]>`
  - `getMemberRequestStats(): Promise<MemberRequestStats[]>`
  - `createCard(listId, title, status: CardStatus = "planned", requestedBy: number | null = null)`
  - `updateCardStatus(id, status)`, `updateCardRequestedBy(id, memberId | null)`
  - Hooks: `useMembers()`, `useCreateMember()`, `useUpdateMember()`, `useDeleteMember()`, `useStatusSummary()`, `useMemberRequestStats()`, `useCreateCard(listId)` (agora recebe `{ title, status, requestedBy }`), `useUpdateCardStatus(listId)`, `useUpdateCardRequestedBy(listId)`.
  - Query keys: `["members"]`, `["statusSummary"]`, `["memberRequestStats"]`.

- [ ] **Step 1: `src/db/members.ts`**

```ts
import { getDb } from "./client";
import type { BoardStatusSummary, Member, MemberRequestStats } from "../types";

export type MemberPatch = Partial<Pick<Member, "name" | "role" | "contact" | "notes" | "color">>;

const PATCHABLE_FIELDS = ["name", "role", "contact", "notes", "color"] as const;

export async function getMembers(): Promise<Member[]> {
  const db = await getDb();
  return db.select<Member[]>("SELECT * FROM member ORDER BY position ASC");
}

export async function createMember(name: string, color: string): Promise<number> {
  const db = await getDb();
  const maxPosition = await db.select<{ maxPosition: number | null }[]>(
    "SELECT MAX(position) as maxPosition FROM member",
  );
  const position = (maxPosition[0]?.maxPosition ?? 0) + 1;
  const result = await db.execute("INSERT INTO member (name, color, position) VALUES ($1, $2, $3)", [
    name,
    color,
    position,
  ]);
  return result.lastInsertId ?? 0;
}

export async function updateMember(id: number, patch: MemberPatch): Promise<void> {
  const fields = PATCHABLE_FIELDS.filter((f) => patch[f] !== undefined);
  if (fields.length === 0) return;
  const db = await getDb();
  const assignments = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
  await db.execute(`UPDATE member SET ${assignments} WHERE id = $${fields.length + 1}`, [
    ...fields.map((f) => patch[f]),
    id,
  ]);
}

export async function deleteMember(id: number): Promise<void> {
  const db = await getDb();
  // Foreign keys are off (client.ts never enables the pragma), so no ON DELETE would fire —
  // clear the reference by hand. No archived_at filter: an archived card restored later must
  // not point at a member that no longer exists.
  await db.execute("UPDATE card SET requested_by = NULL WHERE requested_by = $1", [id]);
  await db.execute("DELETE FROM member WHERE id = $1", [id]);
}

export async function getStatusSummaryByBoard(): Promise<BoardStatusSummary[]> {
  const db = await getDb();
  // LEFT JOINs keep boards with no (unarchived) cards in the table, with zero counts.
  return db.select<BoardStatusSummary[]>(
    `SELECT board.id AS board_id, board.name AS board_name,
       COALESCE(SUM(card.status = 'planned'), 0) AS planned,
       COALESCE(SUM(card.status = 'in_progress'), 0) AS in_progress,
       COALESCE(SUM(card.status = 'done'), 0) AS done
     FROM board
     LEFT JOIN list ON list.board_id = board.id
     LEFT JOIN card ON card.list_id = list.id AND card.archived_at IS NULL
     GROUP BY board.id
     ORDER BY board.position ASC`,
  );
}

export async function getMemberRequestStats(): Promise<MemberRequestStats[]> {
  const db = await getDb();
  return db.select<MemberRequestStats[]>(
    `SELECT requested_by AS member_id,
       SUM(status = 'planned') AS planned,
       SUM(status = 'in_progress') AS in_progress,
       SUM(status = 'done') AS done
     FROM card
     WHERE requested_by IS NOT NULL AND archived_at IS NULL
     GROUP BY requested_by`,
  );
}
```

- [ ] **Step 2: Estender `src/db/cards.ts`**

Trocar o import de tipo por `import type { Card, CardStatus } from "../types";` e substituir `createCard` por:

```ts
export async function createCard(
  listId: number,
  title: string,
  status: CardStatus = "planned",
  requestedBy: number | null = null,
): Promise<number> {
  const db = await getDb();
  const maxPosition = await db.select<{ maxPosition: number | null }[]>(
    "SELECT MAX(position) as maxPosition FROM card WHERE list_id = $1",
    [listId],
  );
  const position = (maxPosition[0]?.maxPosition ?? 0) + 1;
  const result = await db.execute(
    "INSERT INTO card (list_id, title, position, status, requested_by) VALUES ($1, $2, $3, $4, $5)",
    [listId, title, position, status, requestedBy],
  );
  return result.lastInsertId ?? 0;
}
```

Adicionar depois de `updateCardDueDate`:

```ts
export async function updateCardStatus(id: number, status: CardStatus): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE card SET status = $1, updated_at = datetime('now') WHERE id = $2", [
    status,
    id,
  ]);
}

export async function updateCardRequestedBy(id: number, memberId: number | null): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE card SET requested_by = $1, updated_at = datetime('now') WHERE id = $2",
    [memberId, id],
  );
}
```

- [ ] **Step 3: `src/hooks/useMembers.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMember,
  deleteMember,
  getMemberRequestStats,
  getMembers,
  getStatusSummaryByBoard,
  updateMember,
  type MemberPatch,
} from "../db/members";

export function useMembers() {
  return useQuery({ queryKey: ["members"], queryFn: getMembers });
}

// Summary queries are only mounted while the Team view is open; the default staleTime of 0
// refetches them every time it opens, so card mutations elsewhere don't need to invalidate them.
export function useStatusSummary() {
  return useQuery({ queryKey: ["statusSummary"], queryFn: getStatusSummaryByBoard });
}

export function useMemberRequestStats() {
  return useQuery({ queryKey: ["memberRequestStats"], queryFn: getMemberRequestStats });
}

export function useCreateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) => createMember(name, color),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
  });
}

export function useUpdateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: MemberPatch }) => updateMember(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
  });
}

export function useDeleteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteMember(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      queryClient.invalidateQueries({ queryKey: ["memberRequestStats"] });
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      queryClient.invalidateQueries({ queryKey: ["archivedCards"] });
    },
  });
}
```

- [ ] **Step 4: Estender `src/hooks/useCards.ts`**

Adicionar `updateCardRequestedBy` e `updateCardStatus` ao import de `../db/cards`, e `import type { CardStatus } from "../types";`. Substituir `useCreateCard` por:

```ts
export function useCreateCard(listId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      title,
      status,
      requestedBy,
    }: {
      title: string;
      status: CardStatus;
      requestedBy: number | null;
    }) => createCard(listId, title, status, requestedBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards", listId] });
      queryClient.invalidateQueries({ queryKey: ["cardCount", listId] });
    },
  });
}
```

Adicionar depois de `useUpdateCardDueDate`:

```ts
export function useUpdateCardStatus(listId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: CardStatus }) => updateCardStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", listId] }),
  });
}

export function useUpdateCardRequestedBy(listId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, memberId }: { id: number; memberId: number | null }) =>
      updateCardRequestedBy(id, memberId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", listId] }),
  });
}
```

- [ ] **Step 5: Ajustar o único chamador de `useCreateCard` para compilar**

Em `src/components/board/List.tsx`, `createCard.mutate(title);` → `createCard.mutate({ title, status: "planned", requestedBy: null });` (a Task 6 troca pelos valores escolhidos).

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit` → sem erros. Run: `npm test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/db/members.ts src/db/cards.ts src/hooks/useMembers.ts src/hooks/useCards.ts src/components/board/List.tsx
git commit -m "Add member queries and card status/requested_by mutations

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Componentes de UI compartilhados

**Files:**
- Create: `src/components/ui/StatusPicker.tsx`
- Create: `src/components/ui/StatusBadge.tsx`
- Create: `src/components/ui/MemberSelect.tsx`

**Interfaces:**
- Consumes: `CARD_STATUSES`, `STATUS_LABELS`, `STATUS_COLORS` (Task 2); `Member`, `CardStatus` (Task 1).
- Produces:
  - `<StatusPicker value: CardStatus onChange: (s: CardStatus) => void />`
  - `<StatusBadge status: CardStatus />`
  - `<MemberSelect value: number | null onChange: (id: number | null) => void members: Member[] />`

- [ ] **Step 1: `StatusPicker.tsx`**

```tsx
import type { CardStatus } from "../../types";
import { CARD_STATUSES, STATUS_COLORS, STATUS_LABELS } from "../../lib/status";

interface StatusPickerProps {
  value: CardStatus;
  onChange: (status: CardStatus) => void;
}

export function StatusPicker({ value, onChange }: StatusPickerProps) {
  return (
    <div role="radiogroup" aria-label="Status" className="flex flex-wrap gap-1">
      {CARD_STATUSES.map((status) => {
        const selected = status === value;
        return (
          <button
            key={status}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(status)}
            style={selected ? { borderColor: STATUS_COLORS[status], color: STATUS_COLORS[status] } : undefined}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
              selected ? "bg-bg-base" : "border-border text-text-muted hover:text-text-primary"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
            {STATUS_LABELS[status]}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: `StatusBadge.tsx`**

```tsx
import type { CardStatus } from "../../types";
import { STATUS_COLORS, STATUS_LABELS } from "../../lib/status";

export function StatusBadge({ status }: { status: CardStatus }) {
  return (
    <span className="flex items-center gap-1 text-xs" style={{ color: STATUS_COLORS[status] }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
      {STATUS_LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 3: `MemberSelect.tsx`**

Um `<select>` nativo não pinta opções com cor de forma confiável no WebView2, então a cor aparece numa bolinha ao lado do select, refletindo o membro escolhido.

```tsx
import type { Member } from "../../types";

interface MemberSelectProps {
  value: number | null;
  onChange: (memberId: number | null) => void;
  members: Member[];
}

export function MemberSelect({ value, onChange, members }: MemberSelectProps) {
  const selected = members.find((m) => m.id === value);
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
        style={{ backgroundColor: selected?.color ?? "transparent" }}
      />
      <select
        aria-label="Pedido por"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="min-w-0 flex-1 rounded-lg border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-purple"
      >
        <option value="">Pedido por —</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit` → sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/StatusPicker.tsx src/components/ui/StatusBadge.tsx src/components/ui/MemberSelect.tsx
git commit -m "Add status picker, status badge and member select components

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `InlineEditableText` aceita vazio e placeholder

**Files:**
- Modify: `src/components/ui/InlineEditableText.tsx`

**Interfaces:**
- Produces: props opcionais `placeholder?: string` e `allowEmpty?: boolean` (default `false` — comportamento atual intacto para títulos).

- [ ] **Step 1: Implementar**

Substituir o arquivo por:

```tsx
import { useState } from "react";

interface InlineEditableTextProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  placeholder?: string;
  // Titles must never be blank, so by default an empty edit is discarded; optional fields
  // (a member's role, contact, notes) opt in to being cleared.
  allowEmpty?: boolean;
}

export function InlineEditableText({ value, onSave, className, placeholder, allowEmpty = false }: InlineEditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    const trimmed = draft.trim();
    if ((trimmed || allowEmpty) && trimmed !== value) {
      onSave(trimmed);
    }
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        className={`rounded-lg border border-accent-purple bg-bg-elevated px-2 py-1 text-text-primary outline-none ${className ?? ""}`}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span className={`rounded-lg px-2 py-1 hover:bg-bg-elevated ${className ?? ""}`}>
      <span
        className={`cursor-text ${value ? "" : "italic text-text-muted"}`}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value || placeholder}
      </span>
    </span>
  );
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit` → sem erros. Títulos de card/lista continuam sem aceitar vazio (nenhum chamador passa `allowEmpty`).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/InlineEditableText.tsx
git commit -m "Let InlineEditableText show a placeholder and optionally save empty values

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Criação de card e selos no board

**Files:**
- Modify: `src/components/board/BoardView.tsx`
- Modify: `src/components/board/List.tsx`
- Modify: `src/components/board/Card.tsx`

**Interfaces:**
- Consumes: `useMembers()` (Task 3); `StatusPicker`, `StatusBadge`, `MemberSelect` (Task 4); `useCreateCard` com objeto (Task 3).
- Produces: `List` recebe `members: Member[]` e `membersById: Map<number, Member>`; `Card` recebe `requestedBy?: Member`.

- [ ] **Step 1: `BoardView.tsx` — carregar membros e repassar**

Adicionar import `import { useMembers } from "../../hooks/useMembers";` e `Member` ao import de tipos (`import type { Card as CardType, List as ListType, Member } from "../../types";`). Logo abaixo de `const { data: checklistProgressByCard } = useChecklistProgressForCards(allCardIds);`:

```tsx
  const { data: members } = useMembers();
  const memberList = members ?? [];
  const membersById = new Map<number, Member>(memberList.map((m) => [m.id, m]));
```

No `<List ...>` (linha ~406), adicionar:

```tsx
                  members={memberList}
                  membersById={membersById}
```

- [ ] **Step 2: `List.tsx` — props, estado e formulário de criação**

Tipos: `import type { Card as CardType, Label, List as ListType, CardStatus, Member } from "../../types";`. Imports novos:

```tsx
import { MemberSelect } from "../ui/MemberSelect";
import { StatusPicker } from "../ui/StatusPicker";
```

Em `ListProps` adicionar `members: Member[];` e `membersById: Map<number, Member>;`, e desestruturar os dois na assinatura.

Depois de `const [newCardTitle, setNewCardTitle] = useState("");`:

```tsx
  const [newCardStatus, setNewCardStatus] = useState<CardStatus>("planned");
  const [newCardRequestedBy, setNewCardRequestedBy] = useState<number | null>(null);
```

`handleAddCard`:

```tsx
  function handleAddCard() {
    const title = newCardTitle.trim();
    if (!title) return;
    createCard.mutate({ title, status: newCardStatus, requestedBy: newCardRequestedBy });
    setNewCardTitle("");
    setNewCardStatus("planned");
    setNewCardRequestedBy(null);
  }
```

Passar para cada `<Card>`: `requestedBy={card.requested_by !== null ? membersById.get(card.requested_by) : undefined}`.

Substituir o `<div className="flex gap-2">` do input de novo card por:

```tsx
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCard()}
              placeholder="Novo card..."
              className="flex-1 rounded-lg border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary outline-none focus:border-accent-purple"
            />
            <button
              type="button"
              onClick={handleAddCard}
              className="rounded-lg bg-accent-purple px-3 py-1 text-sm font-medium text-bg-base hover:opacity-90"
            >
              +
            </button>
          </div>
          <StatusPicker value={newCardStatus} onChange={setNewCardStatus} />
          {members.length > 0 && (
            <MemberSelect value={newCardRequestedBy} onChange={setNewCardRequestedBy} members={members} />
          )}
        </div>
```

- [ ] **Step 3: `Card.tsx` — selos**

Tipos: `import type { Card as CardType, Label, Member } from "../../types";` e `import { StatusBadge } from "../ui/StatusBadge";`. Em `CardProps` adicionar `requestedBy?: Member;` e desestruturar. Logo antes do `</motion.div>` final:

```tsx
        <div className="flex items-center justify-between gap-2 px-2">
          <StatusBadge status={card.status} />
          {requestedBy && (
            <span className="flex min-w-0 items-center gap-1 text-xs text-text-muted" title={`Pedido por ${requestedBy.name}`}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: requestedBy.color }} />
              <span className="truncate">por {requestedBy.name}</span>
            </span>
          )}
        </div>
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit` → sem erros. Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/board/BoardView.tsx src/components/board/List.tsx src/components/board/Card.tsx
git commit -m "Pick status and requester when creating cards, show them on the card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Painel de detalhe, aba Equipe e navegação

**Files:**
- Modify: `src/components/card-detail/CardDetailPanel.tsx`
- Create: `src/components/team/MemberCard.tsx`
- Create: `src/components/team/TeamView.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: hooks da Task 3; `StatusPicker`, `MemberSelect` (Task 4); `InlineEditableText` com `allowEmpty`/`placeholder` (Task 5); `MEMBER_COLORS`, `nextMemberColor` (Task 2); `CARD_STATUSES`, `STATUS_LABELS`, `STATUS_COLORS` (Task 2).
- Produces: `<TeamView onBack: () => void />`; `App` com `view: "board" | "archive" | "team"`.

- [ ] **Step 1: `CardDetailPanel.tsx`**

Imports: adicionar `useUpdateCardRequestedBy, useUpdateCardStatus` ao import de `useCards`, e:

```tsx
import { useMembers } from "../../hooks/useMembers";
import { MemberSelect } from "../ui/MemberSelect";
import { StatusPicker } from "../ui/StatusPicker";
```

No corpo, junto dos outros hooks:

```tsx
  const updateStatus = useUpdateCardStatus(card.list_id);
  const updateRequestedBy = useUpdateCardRequestedBy(card.list_id);
  const { data: members } = useMembers();
```

Antes do `<label ...>Vencimento`:

```tsx
        <div className="flex flex-col gap-1 text-sm text-text-muted">
          Status
          <StatusPicker value={card.status} onChange={(status) => updateStatus.mutate({ id: card.id, status })} />
        </div>

        <div className="flex flex-col gap-1 text-sm text-text-muted">
          Pedido por
          {(members ?? []).length > 0 ? (
            <MemberSelect
              value={card.requested_by}
              onChange={(memberId) => updateRequestedBy.mutate({ id: card.id, memberId })}
              members={members ?? []}
            />
          ) : (
            <span className="text-xs">Cadastre membros na aba Equipe.</span>
          )}
        </div>
```

- [ ] **Step 2: `MemberCard.tsx`**

```tsx
import { useState } from "react";
import { motion } from "framer-motion";
import type { Member, StatusCounts } from "../../types";
import type { MemberPatch } from "../../db/members";
import { useDeleteMember, useUpdateMember } from "../../hooks/useMembers";
import { MEMBER_COLORS } from "../../lib/memberColors";
import { InlineEditableText } from "../ui/InlineEditableText";

interface MemberCardProps {
  member: Member;
  stats?: StatusCounts;
}

export function MemberCard({ member, stats }: MemberCardProps) {
  const updateMember = useUpdateMember();
  const deleteMember = useDeleteMember();
  const [pickingColor, setPickingColor] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const total = stats ? stats.planned + stats.in_progress + stats.done : 0;
  const save = (patch: MemberPatch) => updateMember.mutate({ id: member.id, patch });

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-2 rounded-2xl border border-border bg-bg-surface p-4"
    >
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickingColor((v) => !v)}
            style={{ backgroundColor: member.color }}
            className="h-4 w-4 rounded-full"
            aria-label="Trocar cor"
          />
          {pickingColor && (
            <div className="absolute left-0 top-6 z-10 grid w-max grid-cols-5 gap-1 rounded-xl border border-border bg-bg-elevated p-2">
              {MEMBER_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    save({ color });
                    setPickingColor(false);
                  }}
                  style={{ backgroundColor: color }}
                  className={`h-5 w-5 rounded-full ${color === member.color.toLowerCase() ? "ring-2 ring-text-primary" : ""}`}
                  aria-label={`Cor ${color}`}
                />
              ))}
            </div>
          )}
        </div>
        <InlineEditableText value={member.name} onSave={(name) => save({ name })} className="flex-1 font-semibold" />
        {confirmingDelete ? (
          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => deleteMember.mutate(member.id)}
              className="rounded-lg bg-accent-pink px-2 py-1 text-bg-base"
            >
              Excluir
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-lg px-2 py-1 text-text-muted hover:bg-bg-elevated"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-lg px-1 text-text-muted hover:bg-accent-pink hover:text-bg-base"
            aria-label="Excluir membro"
          >
            ×
          </button>
        )}
      </div>
      {confirmingDelete && (
        <p className="text-xs text-text-muted">
          Os cards pedidos por {member.name} ficarão sem "pedido por".
        </p>
      )}
      <InlineEditableText
        value={member.role}
        onSave={(role) => save({ role })}
        placeholder="Função"
        allowEmpty
        className="text-sm"
      />
      <InlineEditableText
        value={member.contact}
        onSave={(contact) => save({ contact })}
        placeholder="Contato"
        allowEmpty
        className="text-sm"
      />
      <InlineEditableText
        value={member.notes}
        onSave={(notes) => save({ notes })}
        placeholder="Observações"
        allowEmpty
        className="text-sm"
      />
      <p className="px-2 text-xs text-text-muted">
        {total === 0
          ? "Nenhuma tarefa pedida"
          : `pediu ${total} · ${stats!.in_progress} em processo · ${stats!.done} finalizada${stats!.done === 1 ? "" : "s"}`}
      </p>
    </motion.div>
  );
}
```

- [ ] **Step 3: `TeamView.tsx`**

```tsx
import type { StatusCounts } from "../../types";
import {
  useCreateMember,
  useMemberRequestStats,
  useMembers,
  useStatusSummary,
} from "../../hooks/useMembers";
import { nextMemberColor } from "../../lib/memberColors";
import { CARD_STATUSES, STATUS_COLORS, STATUS_LABELS } from "../../lib/status";
import { MemberCard } from "./MemberCard";

interface TeamViewProps {
  onBack: () => void;
}

function sumCounts(counts: StatusCounts) {
  return counts.planned + counts.in_progress + counts.done;
}

export function TeamView({ onBack }: TeamViewProps) {
  const { data: members } = useMembers();
  const { data: summary } = useStatusSummary();
  const { data: requestStats } = useMemberRequestStats();
  const createMember = useCreateMember();

  const memberList = members ?? [];
  const rows = summary ?? [];
  const statsByMember = new Map((requestStats ?? []).map((s) => [s.member_id, s]));
  const totals: StatusCounts = {
    planned: rows.reduce((acc, r) => acc + r.planned, 0),
    in_progress: rows.reduce((acc, r) => acc + r.in_progress, 0),
    done: rows.reduce((acc, r) => acc + r.done, 0),
  };

  function handleAddMember() {
    createMember.mutate({ name: "Novo membro", color: nextMemberColor(memberList.map((m) => m.color)) });
  }

  return (
    <div className="flex h-full flex-col gap-8 overflow-y-auto p-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-3 py-1 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
        >
          ← Voltar
        </button>
        <h1 className="text-2xl font-semibold text-text-primary">Equipe</h1>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text-primary">Andamento</h2>
        <div className="overflow-x-auto rounded-2xl border border-border bg-bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="px-4 py-2 font-medium">Board</th>
                {CARD_STATUSES.map((status) => (
                  <th key={status} className="px-4 py-2 text-right font-medium" style={{ color: STATUS_COLORS[status] }}>
                    {STATUS_LABELS[status]}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.board_id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-text-primary">{row.board_name}</td>
                  {CARD_STATUSES.map((status) => (
                    <td key={status} className="px-4 py-2 text-right tabular-nums">
                      {row[status]}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right tabular-nums">{sumCounts(row)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 1 && (
              <tfoot>
                <tr className="border-t border-border font-semibold text-text-primary">
                  <td className="px-4 py-2">Total</td>
                  {CARD_STATUSES.map((status) => (
                    <td key={status} className="px-4 py-2 text-right tabular-nums">
                      {totals[status]}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right tabular-nums">{sumCounts(totals)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Membros</h2>
          <button
            type="button"
            onClick={handleAddMember}
            className="rounded-lg bg-accent-purple px-3 py-1 text-sm font-medium text-bg-base hover:opacity-90"
          >
            + Membro
          </button>
        </div>
        {memberList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-text-muted">
            Nenhum membro ainda.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
            {memberList.map((member) => (
              <MemberCard key={member.id} member={member} stats={statsByMember.get(member.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

(O spec dizia "criar e focar o nome"; `InlineEditableText` edita por duplo clique, então o membro nasce como "Novo membro" e o usuário dá duplo clique para renomear — sem mexer no componente para foco automático.)

- [ ] **Step 4: `App.tsx` — `view` e botão Equipe**

Import: `import { TeamView } from "./components/team/TeamView";`.

Trocar `const [showArchive, setShowArchive] = useState(false);` por:

```tsx
  const [view, setView] = useState<"board" | "archive" | "team">("board");
```

Em `handleNavigate`: `setShowArchive(false);` → `setView("board");`. Em `handleSelectBoard`, adicionar `setView((v) => (v === "team" ? "board" : v));` como primeira linha (trocar de board estando em Arquivados continua mostrando os arquivados do novo board, como hoje).

Barra superior — substituir o `<div className="flex items-center justify-between border-b ...">` inteiro por:

```tsx
      <div className="flex items-center justify-between border-b border-border bg-bg-surface">
        <button
          type="button"
          onClick={() => setView((v) => (v === "team" ? "board" : "team"))}
          aria-label="Equipe"
          aria-pressed={view === "team"}
          title="Equipe"
          className={`ml-4 shrink-0 rounded-lg p-1.5 transition-colors ${
            view === "team" ? "bg-accent-purple text-bg-base" : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
          }`}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </button>
        <BoardSwitcher activeBoardId={activeBoardId} onSelect={handleSelectBoard} />
        {activeBoard && view !== "team" && (
          <button
            type="button"
            onClick={() => setView((v) => (v === "archive" ? "board" : "archive"))}
            className="mr-4 shrink-0 rounded-lg px-3 py-1 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
          >
            {view === "archive" ? "Board" : "Arquivados"}
          </button>
        )}
      </div>
```

Conteúdo principal — substituir o ternário `{activeBoard ? (showArchive ? ... ) : (...)}` por:

```tsx
      {view === "team" ? (
        <TeamView onBack={() => setView("board")} />
      ) : activeBoard ? (
        view === "archive" ? (
          <ArchiveView boardId={activeBoard.id} boardName={activeBoard.name} onBack={() => setView("board")} />
        ) : (
          <BoardView
            boardId={activeBoard.id}
            boardName={activeBoard.name}
            initialSelectedCardId={pendingCardId}
            onInitialCardHandled={() => setPendingCardId(null)}
            initialHighlightListId={pendingListId}
            onInitialListHandled={() => setPendingListId(null)}
          />
        )
      ) : (
        <div className="flex flex-1 items-center justify-center text-text-muted">
          Nenhum board ainda.
        </div>
      )}
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit` → sem erros. Run: `npm test` → PASS. Run: `npm run build` → build ok.

- [ ] **Step 6: Commit**

```bash
git add src/components/card-detail/CardDetailPanel.tsx src/components/team src/App.tsx
git commit -m "Add Team view with members and status summary, edit status in card panel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Verificação no app real

**Files:** nenhum (só se um bug aparecer — aí corrigir na task dona e commitar).

- [ ] **Step 1: Copiar os dados reais para o banco de dev (teste de upgrade)**

PowerShell:

```powershell
Copy-Item "$env:APPDATA\com.pedroromeiro.tododay\kanban.db" "$env:APPDATA\com.pedroromeiro.tododay\kanban-dev.db"
```

(Só copia; o `kanban.db` original não é tocado. Se a outra sessão estiver rodando `tauri dev` na porta 1420, esperar ou parar antes.)

- [ ] **Step 2: Rodar pelo PowerShell (não Git Bash — ver CLAUDE.md sobre `link.exe`)**

```powershell
cd C:\Users\pedro.romeiro\Desktop\projeto-equipe-status
npm run tauri dev
```

- [ ] **Step 3: Checklist manual**

1. Cards antigos aparecem com selo "Planejada"; nenhum "por X".
2. Ícone de pessoas no canto superior esquerdo abre "Equipe"; clicar de novo ou em "← Voltar" volta ao board; clicar num board também volta.
3. Tabela "Andamento": um board sem cards aparece com zeros; linha Total aparece com 2+ boards.
4. "+ Membro" 3×: cores diferentes; duplo clique renomeia; trocar a cor pela bolinha.
5. Preencher função/contato/observações, depois apagar um deles: o campo mostra o placeholder em itálico e continua editável.
6. No board: criar card escolhendo "Em processo" + um membro → card mostra selo âmbar e "por Nome" com a cor; o formulário volta a Planejada/—.
7. Painel de detalhe: trocar status e pedido por; o card no board acompanha.
8. Voltar à Equipe: contagens da tabela e "pediu N · ..." do membro batem.
9. Arquivar um card pedido por um membro, excluir esse membro (confirmação mostra o aviso), restaurar o card em Arquivados → card sem "por X" e sem erro.
10. Busca (Ctrl+K) estando na aba Equipe navega para o card no board.

- [ ] **Step 4: Rodar a suíte final**

Run: `npm test` e `npx tsc --noEmit` → ambos ok. Registrar o resultado.
