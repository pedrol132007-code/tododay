# Fase 2 — CRUD de Colunas e Cards (sem drag and drop) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full CRUD for boards, lists (colunas) and cards — create, rename, reorder (via arrow buttons, no drag and drop yet), delete/archive — wired end-to-end through SQLite, with the board switcher letting the user move between multiple boards.

**Architecture:** Same layering as Phase 1: `src/db/*.ts` holds every query, `src/hooks/*.ts` wraps them in React Query, components stay presentational. Reordering is a simple two-row position swap with the adjacent sibling (no midpoint algorithm yet — that generalized helper is reserved for Phase 3's real drag-and-drop). Cards are never hard-deleted, only archived (`archived_at`); lists can only be deleted when empty, enforced client-side using data already loaded by `useCards`.

**Tech Stack:** Same as Phase 1 — Tauri v2, React 18, TypeScript, Tailwind, `@tauri-apps/plugin-sql`, TanStack Query, `framer-motion`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-17-kanban-desktop-design.md`
**Previous plan (merged, Phase 1 complete):** `docs/superpowers/plans/2026-09-17-fase1-setup-schema-board-vazio.md`

## Global Constraints

- Node.js, npm and Rust/Cargo are still **not installed** on this machine. Every "Run: …" step is documentation of the command to run later (Task 8 collects them), not something to execute now — write final, correct file content directly.
- No SQL outside `src/db/*.ts`.
- Cards are **never hard-deleted** — "deleting" a card sets `archived_at = datetime('now')`. This is unconditional, not phase-gated (the archived-items *view* is Phase 5, but the archiving behavior itself starts now).
- A list can only be deleted when it has zero non-archived cards. Enforced in `List.tsx` using the card list already fetched by `useCards` (no extra COUNT query) — the delete button is disabled with a tooltip explaining why, and the mutation is never called for a non-empty list.
- Reordering (lists and cards) is a **position swap with the immediate neighbor** — two `UPDATE` statements, no midpoint math, no shared `lib/position.ts` helper yet. That helper is explicitly deferred to Phase 3 (per `CLAUDE.md`).
- New items append at the end: `MAX(position) + 1` (or `1` if the parent is empty).
- `list.wip_limit` stays unused — no UI reads or writes it. It was never requested as a feature (only present in the data model); don't build it speculatively.
- Keyboard shortcuts (Ctrl+N, Ctrl+B, Ctrl+1..9, etc.) are **out of scope for this phase** — implementing them well needs a notion of "focused list" that doesn't exist yet, and none of the phases explicitly call for them yet either. Revisit once there's a natural home for that state.
- No test runner is installed — same as Phase 1, transcribe exact code, verify by reading files back, defer execution to Task 8.
- Tailwind tokens, dark theme, rounded corners, and the light `framer-motion` fade/slide convention from Phase 1 continue unchanged.

---

### Task 1: DB layer — lists, cards, board creation

**Files:**
- Modify: `src/db/boards.ts`
- Create: `src/db/lists.ts`
- Create: `src/db/cards.ts`

**Interfaces:**
- Consumes: `getDb` from `./client`, `Board`/`List`/`Card` types from `../types` (all from Phase 1).
- Produces: `createBoard(name): Promise<number>` (added to `boards.ts`); `listLists(boardId): Promise<List[]>`, `createList(boardId, name): Promise<number>`, `renameList(id, name): Promise<void>`, `deleteList(id): Promise<void>`, `moveList(id, direction): Promise<void>` (`lists.ts`); `listCards(listId): Promise<Card[]>`, `createCard(listId, title): Promise<number>`, `renameCard(id, title): Promise<void>`, `archiveCard(id): Promise<void>`, `moveCard(id, direction): Promise<void>` (`cards.ts`). All consumed by Task 2's hooks.

- [ ] **Step 1: Add `createBoard` to `src/db/boards.ts`**

Append to the existing file (keep `listBoards` as-is):

```ts
export async function createBoard(name: string): Promise<number> {
  const db = await getDb();
  const maxPosition = await db.select<{ maxPosition: number | null }[]>(
    "SELECT MAX(position) as maxPosition FROM board",
  );
  const position = (maxPosition[0]?.maxPosition ?? 0) + 1;
  const result = await db.execute("INSERT INTO board (name, position) VALUES ($1, $2)", [
    name,
    position,
  ]);
  return result.lastInsertId;
}
```

- [ ] **Step 2: Write `src/db/lists.ts`**

```ts
import { getDb } from "./client";
import type { List } from "../types";

export async function listLists(boardId: number): Promise<List[]> {
  const db = await getDb();
  return db.select<List[]>("SELECT * FROM list WHERE board_id = $1 ORDER BY position ASC", [
    boardId,
  ]);
}

export async function createList(boardId: number, name: string): Promise<number> {
  const db = await getDb();
  const maxPosition = await db.select<{ maxPosition: number | null }[]>(
    "SELECT MAX(position) as maxPosition FROM list WHERE board_id = $1",
    [boardId],
  );
  const position = (maxPosition[0]?.maxPosition ?? 0) + 1;
  const result = await db.execute(
    "INSERT INTO list (board_id, name, position) VALUES ($1, $2, $3)",
    [boardId, name, position],
  );
  return result.lastInsertId;
}

export async function renameList(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE list SET name = $1 WHERE id = $2", [name, id]);
}

export async function deleteList(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM list WHERE id = $1", [id]);
}

export async function moveList(id: number, direction: "left" | "right"): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ id: number; board_id: number; position: number }[]>(
    "SELECT id, board_id, position FROM list WHERE id = $1",
    [id],
  );
  const current = rows[0];
  if (!current) return;

  const neighborQuery =
    direction === "left"
      ? "SELECT id, position FROM list WHERE board_id = $1 AND position < $2 ORDER BY position DESC LIMIT 1"
      : "SELECT id, position FROM list WHERE board_id = $1 AND position > $2 ORDER BY position ASC LIMIT 1";
  const neighborRows = await db.select<{ id: number; position: number }[]>(neighborQuery, [
    current.board_id,
    current.position,
  ]);
  const neighbor = neighborRows[0];
  if (!neighbor) return;

  await db.execute("UPDATE list SET position = $1 WHERE id = $2", [neighbor.position, current.id]);
  await db.execute("UPDATE list SET position = $1 WHERE id = $2", [current.position, neighbor.id]);
}
```

- [ ] **Step 3: Write `src/db/cards.ts`**

```ts
import { getDb } from "./client";
import type { Card } from "../types";

export async function listCards(listId: number): Promise<Card[]> {
  const db = await getDb();
  return db.select<Card[]>(
    "SELECT * FROM card WHERE list_id = $1 AND archived_at IS NULL ORDER BY position ASC",
    [listId],
  );
}

export async function createCard(listId: number, title: string): Promise<number> {
  const db = await getDb();
  const maxPosition = await db.select<{ maxPosition: number | null }[]>(
    "SELECT MAX(position) as maxPosition FROM card WHERE list_id = $1",
    [listId],
  );
  const position = (maxPosition[0]?.maxPosition ?? 0) + 1;
  const result = await db.execute(
    "INSERT INTO card (list_id, title, position) VALUES ($1, $2, $3)",
    [listId, title, position],
  );
  return result.lastInsertId;
}

export async function renameCard(id: number, title: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE card SET title = $1, updated_at = datetime('now') WHERE id = $2", [
    title,
    id,
  ]);
}

export async function archiveCard(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE card SET archived_at = datetime('now') WHERE id = $1", [id]);
}

export async function moveCard(id: number, direction: "up" | "down"): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ id: number; list_id: number; position: number }[]>(
    "SELECT id, list_id, position FROM card WHERE id = $1",
    [id],
  );
  const current = rows[0];
  if (!current) return;

  const neighborQuery =
    direction === "up"
      ? "SELECT id, position FROM card WHERE list_id = $1 AND archived_at IS NULL AND position < $2 ORDER BY position DESC LIMIT 1"
      : "SELECT id, position FROM card WHERE list_id = $1 AND archived_at IS NULL AND position > $2 ORDER BY position ASC LIMIT 1";
  const neighborRows = await db.select<{ id: number; position: number }[]>(neighborQuery, [
    current.list_id,
    current.position,
  ]);
  const neighbor = neighborRows[0];
  if (!neighbor) return;

  await db.execute("UPDATE card SET position = $1 WHERE id = $2", [neighbor.position, current.id]);
  await db.execute("UPDATE card SET position = $1 WHERE id = $2", [current.position, neighbor.id]);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/db/boards.ts src/db/lists.ts src/db/cards.ts
git commit -m "Add lists/cards query layer and board creation"
```

---

### Task 2: Hooks layer

**Files:**
- Modify: `src/hooks/useBoards.ts`
- Create: `src/hooks/useLists.ts`
- Create: `src/hooks/useCards.ts`

**Interfaces:**
- Consumes: Task 1's db functions.
- Produces: `useCreateBoard()` (added to `useBoards.ts`, returns a mutation whose `mutationFn` resolves to the new board's id); `useLists(boardId)`, `useCreateList(boardId)`, `useRenameList(boardId)`, `useDeleteList(boardId)`, `useMoveList(boardId)` (`useLists.ts`); `useCards(listId)`, `useCreateCard(listId)`, `useRenameCard(listId)`, `useArchiveCard(listId)`, `useMoveCard(listId)` (`useCards.ts`). All consumed by Tasks 4-7's components.

- [ ] **Step 1: Add `useCreateBoard` to `src/hooks/useBoards.ts`**

Append to the existing file (keep `useBoards` as-is), update the import line to include `useMutation` and `useQueryClient`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBoard, listBoards } from "../db/boards";

export function useBoards() {
  return useQuery({
    queryKey: ["boards"],
    queryFn: listBoards,
  });
}

export function useCreateBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createBoard(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["boards"] }),
  });
}
```

- [ ] **Step 2: Write `src/hooks/useLists.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createList, deleteList, listLists, moveList, renameList } from "../db/lists";

export function useLists(boardId: number) {
  return useQuery({
    queryKey: ["lists", boardId],
    queryFn: () => listLists(boardId),
  });
}

export function useCreateList(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createList(boardId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists", boardId] }),
  });
}

export function useRenameList(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameList(id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists", boardId] }),
  });
}

export function useDeleteList(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteList(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists", boardId] }),
  });
}

export function useMoveList(boardId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, direction }: { id: number; direction: "left" | "right" }) =>
      moveList(id, direction),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists", boardId] }),
  });
}
```

- [ ] **Step 3: Write `src/hooks/useCards.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { archiveCard, createCard, listCards, moveCard, renameCard } from "../db/cards";

export function useCards(listId: number) {
  return useQuery({
    queryKey: ["cards", listId],
    queryFn: () => listCards(listId),
  });
}

export function useCreateCard(listId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => createCard(listId, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", listId] }),
  });
}

export function useRenameCard(listId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) => renameCard(id, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", listId] }),
  });
}

export function useArchiveCard(listId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => archiveCard(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", listId] }),
  });
}

export function useMoveCard(listId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, direction }: { id: number; direction: "up" | "down" }) =>
      moveCard(id, direction),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", listId] }),
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useBoards.ts src/hooks/useLists.ts src/hooks/useCards.ts
git commit -m "Add React Query hooks for lists, cards, and board creation"
```

---

### Task 3: Inline-editable text primitive

**Files:**
- Create: `src/components/ui/InlineEditableText.tsx`

**Interfaces:**
- Consumes: nothing project-specific (plain React state).
- Produces: `<InlineEditableText value={string} onSave={(value: string) => void} className?={string} />` — double-click to edit, Enter/blur to save (no-op if unchanged or empty), Escape to cancel. Consumed by Tasks 4 and 5 (card title, list name).

- [ ] **Step 1: Write `src/components/ui/InlineEditableText.tsx`**

```tsx
import { useState } from "react";

interface InlineEditableTextProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
}

export function InlineEditableText({ value, onSave, className }: InlineEditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
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
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
      />
    );
  }

  return (
    <span
      className={`cursor-text rounded-lg px-2 py-1 hover:bg-bg-elevated ${className ?? ""}`}
      onDoubleClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {value}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/InlineEditableText.tsx
git commit -m "Add InlineEditableText primitive"
```

---

### Task 4: Card component

**Files:**
- Create: `src/components/board/Card.tsx`

**Interfaces:**
- Consumes: `Card` type (Phase 1, `../../types`), `useRenameCard`/`useArchiveCard`/`useMoveCard` (Task 2), `InlineEditableText` (Task 3).
- Produces: `<Card card={CardType} isFirst={boolean} isLast={boolean} />`, consumed by Task 5's `List`.

- [ ] **Step 1: Write `src/components/board/Card.tsx`**

```tsx
import { motion } from "framer-motion";
import type { Card as CardType } from "../../types";
import { useArchiveCard, useMoveCard, useRenameCard } from "../../hooks/useCards";
import { InlineEditableText } from "../ui/InlineEditableText";

interface CardProps {
  card: CardType;
  isFirst: boolean;
  isLast: boolean;
}

export function Card({ card, isFirst, isLast }: CardProps) {
  const renameCard = useRenameCard(card.list_id);
  const archiveCard = useArchiveCard(card.list_id);
  const moveCard = useMoveCard(card.list_id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center justify-between gap-2 rounded-xl border border-border bg-bg-elevated px-3 py-2"
    >
      <InlineEditableText
        value={card.title}
        onSave={(title) => renameCard.mutate({ id: card.id, title })}
        className="flex-1"
      />
      <div className="flex items-center gap-1 text-text-muted">
        <button
          type="button"
          disabled={isFirst}
          onClick={() => moveCard.mutate({ id: card.id, direction: "up" })}
          className="rounded-lg px-1 hover:bg-bg-surface disabled:opacity-30"
          aria-label="Mover card para cima"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={isLast}
          onClick={() => moveCard.mutate({ id: card.id, direction: "down" })}
          className="rounded-lg px-1 hover:bg-bg-surface disabled:opacity-30"
          aria-label="Mover card para baixo"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={() => archiveCard.mutate(card.id)}
          className="rounded-lg px-1 hover:bg-accent-pink hover:text-bg-base"
          aria-label="Arquivar card"
        >
          ×
        </button>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/board/Card.tsx
git commit -m "Add Card component"
```

---

### Task 5: List component

**Files:**
- Create: `src/components/board/List.tsx`

**Interfaces:**
- Consumes: `List` type (Phase 1), `useCards`/`useCreateCard` (Task 2), `useRenameList`/`useDeleteList`/`useMoveList` (Task 2), `InlineEditableText` (Task 3), `Card` (Task 4).
- Produces: `<List list={ListType} boardId={number} isFirst={boolean} isLast={boolean} />`, consumed by Task 7's `BoardView`.

- [ ] **Step 1: Write `src/components/board/List.tsx`**

```tsx
import { useState } from "react";
import { motion } from "framer-motion";
import type { List as ListType } from "../../types";
import { useCards, useCreateCard } from "../../hooks/useCards";
import { useDeleteList, useMoveList, useRenameList } from "../../hooks/useLists";
import { InlineEditableText } from "../ui/InlineEditableText";
import { Card } from "./Card";

interface ListProps {
  list: ListType;
  boardId: number;
  isFirst: boolean;
  isLast: boolean;
}

export function List({ list, boardId, isFirst, isLast }: ListProps) {
  const { data: cards } = useCards(list.id);
  const createCard = useCreateCard(list.id);
  const renameList = useRenameList(boardId);
  const deleteList = useDeleteList(boardId);
  const moveList = useMoveList(boardId);
  const [newCardTitle, setNewCardTitle] = useState("");

  const cardList = cards ?? [];
  const canDelete = cardList.length === 0;

  function handleAddCard() {
    const title = newCardTitle.trim();
    if (!title) return;
    createCard.mutate(title);
    setNewCardTitle("");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex w-72 shrink-0 flex-col gap-3 rounded-2xl border border-border bg-bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <InlineEditableText
          value={list.name}
          onSave={(name) => renameList.mutate({ id: list.id, name })}
          className="text-lg font-semibold"
        />
        <div className="flex items-center gap-1 text-text-muted">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => moveList.mutate({ id: list.id, direction: "left" })}
            className="rounded-lg px-1 hover:bg-bg-elevated disabled:opacity-30"
            aria-label="Mover coluna para esquerda"
          >
            ←
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={() => moveList.mutate({ id: list.id, direction: "right" })}
            className="rounded-lg px-1 hover:bg-bg-elevated disabled:opacity-30"
            aria-label="Mover coluna para direita"
          >
            →
          </button>
          <button
            type="button"
            disabled={!canDelete}
            onClick={() => deleteList.mutate(list.id)}
            title={canDelete ? "Excluir coluna" : "Mova ou arquive os cards antes de excluir"}
            className="rounded-lg px-1 hover:bg-accent-pink hover:text-bg-base disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-muted"
            aria-label="Excluir coluna"
          >
            ×
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {cardList.map((card, index) => (
          <Card
            key={card.id}
            card={card}
            isFirst={index === 0}
            isLast={index === cardList.length - 1}
          />
        ))}
      </div>

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
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/board/List.tsx
git commit -m "Add List component"
```

---

### Task 6: BoardSwitcher component

**Files:**
- Create: `src/components/board/BoardSwitcher.tsx`

**Interfaces:**
- Consumes: `useBoards`/`useCreateBoard` (Task 2).
- Produces: `<BoardSwitcher activeBoardId={number | null} onSelect={(boardId: number) => void} />`, consumed by Task 7's `App`.

- [ ] **Step 1: Write `src/components/board/BoardSwitcher.tsx`**

```tsx
import { useState } from "react";
import { useBoards, useCreateBoard } from "../../hooks/useBoards";

interface BoardSwitcherProps {
  activeBoardId: number | null;
  onSelect: (boardId: number) => void;
}

export function BoardSwitcher({ activeBoardId, onSelect }: BoardSwitcherProps) {
  const { data: boards } = useBoards();
  const createBoard = useCreateBoard();
  const [creating, setCreating] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");

  function handleCreate() {
    const name = newBoardName.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    createBoard.mutate(name, {
      onSuccess: (id) => onSelect(id),
    });
    setNewBoardName("");
    setCreating(false);
  }

  return (
    <div className="flex items-center gap-2 border-b border-border bg-bg-surface px-4 py-2">
      {(boards ?? []).map((board) => (
        <button
          key={board.id}
          type="button"
          onClick={() => onSelect(board.id)}
          className={`rounded-xl px-3 py-1 text-sm font-medium transition-colors ${
            board.id === activeBoardId
              ? "bg-accent-purple text-bg-base"
              : "text-text-muted hover:bg-bg-elevated"
          }`}
        >
          {board.name}
        </button>
      ))}
      {creating ? (
        <input
          autoFocus
          value={newBoardName}
          onChange={(e) => setNewBoardName(e.target.value)}
          onBlur={handleCreate}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
            if (e.key === "Escape") setCreating(false);
          }}
          placeholder="Nome do board..."
          className="rounded-xl border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary outline-none focus:border-accent-purple"
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-xl px-3 py-1 text-sm text-text-muted hover:bg-bg-elevated"
          aria-label="Novo board"
        >
          + Novo board
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/board/BoardSwitcher.tsx
git commit -m "Add BoardSwitcher component"
```

---

### Task 7: Wire it together — BoardView and App

**Files:**
- Modify: `src/components/board/BoardView.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useLists`/`useCreateList` (Task 2), `List` (Task 5), `BoardSwitcher` (Task 6), `useBoards` (Phase 1).
- Produces: the fully wired app — `App` owns `activeBoardId` state and renders `BoardSwitcher` + `BoardView`.

- [ ] **Step 1: Replace `src/components/board/BoardView.tsx`**

Replace the entire file (Phase 1's single-seeded-board version is fully superseded):

```tsx
import { useState } from "react";
import { useCreateList, useLists } from "../../hooks/useLists";
import { List } from "./List";

interface BoardViewProps {
  boardId: number;
  boardName: string;
}

export function BoardView({ boardId, boardName }: BoardViewProps) {
  const { data: lists, isLoading, error } = useLists(boardId);
  const createList = useCreateList(boardId);
  const [newListName, setNewListName] = useState("");

  function handleAddList() {
    const name = newListName.trim();
    if (!name) return;
    createList.mutate(name);
    setNewListName("");
  }

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
        Erro ao carregar colunas: {(error as Error).message}
      </div>
    );
  }

  const listData = lists ?? [];

  return (
    <div className="flex h-full flex-col p-6">
      <h1 className="mb-6 text-2xl font-semibold text-text-primary">{boardName}</h1>
      <div className="flex flex-1 items-start gap-4 overflow-x-auto">
        {listData.length === 0 ? (
          <div className="rounded-2xl border border-border bg-bg-surface p-6 text-text-muted">
            Nenhuma lista ainda.
          </div>
        ) : (
          listData.map((list, index) => (
            <List
              key={list.id}
              list={list}
              boardId={boardId}
              isFirst={index === 0}
              isLast={index === listData.length - 1}
            />
          ))
        )}
        <div className="flex w-72 shrink-0 flex-col gap-2 rounded-2xl border border-dashed border-border p-4">
          <input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddList()}
            placeholder="Nova coluna..."
            className="rounded-lg border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary outline-none focus:border-accent-purple"
          />
          <button
            type="button"
            onClick={handleAddList}
            className="rounded-lg bg-accent-purple px-3 py-1 text-sm font-medium text-bg-base hover:opacity-90"
          >
            + Adicionar coluna
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `src/App.tsx`**

Replace the entire file:

```tsx
import { useEffect, useState } from "react";
import { useBoards } from "./hooks/useBoards";
import { BoardSwitcher } from "./components/board/BoardSwitcher";
import { BoardView } from "./components/board/BoardView";

export default function App() {
  const { data: boards } = useBoards();
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);

  useEffect(() => {
    if (activeBoardId === null && boards && boards.length > 0) {
      setActiveBoardId(boards[0].id);
    }
  }, [boards, activeBoardId]);

  const activeBoard = boards?.find((board) => board.id === activeBoardId);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <BoardSwitcher activeBoardId={activeBoardId} onSelect={setActiveBoardId} />
      {activeBoard ? (
        <BoardView boardId={activeBoard.id} boardName={activeBoard.name} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-text-muted">
          Nenhum board ainda.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/board/BoardView.tsx src/App.tsx
git commit -m "Wire boards, lists, and cards into the app shell"
```

---

### Task 8: Manual end-to-end verification (run once the toolchain is installed)

**Files:** none (checklist only).

**Interfaces:** none.

- [ ] **Step 1: Install and launch**

```bash
npm install
npm run tauri dev
```
Expected: window opens showing the board switcher bar with "Meu Board" (the Phase 1 seed) active, and "Nenhuma lista ainda." below it.

- [ ] **Step 2: Lists**

Type a name in "Nova coluna..." and press Enter or click "+ Adicionar coluna" — a new column appears. Repeat to create a second column. Double-click a column's name to rename it inline (Enter to save, Escape to cancel). Use ← / → to swap the two columns' order — confirm the arrows are disabled at the respective ends.

- [ ] **Step 3: Cards**

Inside a column, type a card title and press Enter or click "+" — the card appears with a light fade-in. Double-click the card title to rename it inline. Use ↑ / ↓ to reorder cards within the column. Click "×" on a card to archive it — it should disappear from the column (it's soft-deleted, not gone from the database).

- [ ] **Step 4: Delete-list guard**

Try deleting a column that has cards in it — the "×" button next to the column name should be disabled with a tooltip explaining why. Archive or move all its cards out (there's no cross-list move yet — archive them), then confirm the delete button becomes enabled and deleting the now-empty column works.

- [ ] **Step 5: Boards**

Click "+ Novo board", type a name, press Enter — a new board tab appears and the view switches to it automatically. Confirm it starts empty ("Nenhuma lista ainda."). Click back and forth between board tabs and confirm each board's columns/cards are independent.

- [ ] **Step 6: Report back**

Tell me what you saw (all working / anything that didn't match). If everything matches, Phase 2 is done and we move to Phase 3 (drag and drop).
