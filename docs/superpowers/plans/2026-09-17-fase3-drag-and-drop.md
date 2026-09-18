# Fase 3 — Drag and Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the Fase 2 arrow-button reordering with real drag-and-drop: reorder cards within a list, move cards between lists, and reorder columns — all persisted through fractional positions in SQLite.

**Architecture:** `@dnd-kit/core` + `@dnd-kit/sortable` wire a single `DndContext` around the whole board. A new pure module (`src/lib/position.ts`) computes fractional positions and rebalances when floats collapse; `BoardView` is the only component that talks to it. Everything else follows the existing layering: `src/db/*.ts` holds SQL, `src/hooks/*.ts` wraps it in React Query, components stay presentational.

**Tech Stack:** Same as Fases 1–2 (Tauri v2, React 18, TypeScript, Tailwind, `@tauri-apps/plugin-sql`, TanStack Query, `framer-motion`), plus two new dependencies: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (drag-and-drop) and `vitest` (dev-only, unit tests for `position.ts`).

**Spec:** `docs/superpowers/specs/2026-09-17-fase3-drag-and-drop-design.md` (complements the master spec `docs/superpowers/specs/2026-09-17-kanban-desktop-design.md`)

## Global Constraints

- The Fase 2 arrow buttons (↑/↓ on cards, ←/→ on lists) and their backing code (`moveCard`, `moveList`, `useMoveCard`, `useMoveList`) are **removed entirely** — no fallback buttons remain. `isFirst`/`isLast` props on `Card`/`List` are removed too, since nothing needs them anymore.
- **No dedicated drag handle.** The whole `Card` and the whole `List` header (title + delete button row, not the cards inside it) are the draggable surface. `@dnd-kit`'s `PointerSensor` only starts a drag after ~8px of pointer movement (`activationConstraint: { distance: 8 }`), so a plain click/double-click never triggers a drag.
- **dnd-kit's transform and framer-motion's animate must live on different DOM nodes.** Put `useSortable`'s `ref`/`style` (the drag position) on an outer plain `<div>`, and framer-motion's `initial`/`animate` (the entrance fade/slide) on an inner `motion.div`. Putting both on the same element makes them fight over `style.transform`, producing jittery/broken drag visuals.
- `InlineEditableText`'s edit-mode `<input>` must call `e.stopPropagation()` on `onPointerDown`, so selecting text inside it (e.g. to retype part of a title) is never hijacked as the start of a card/list drag.
- `position` columns are already `REAL` in the schema (Fase 1) — no migration needed for existing integer positions; they're valid floats as-is.
- No SQL outside `src/db/*.ts`. Position math (midpoint, rebalance) lives in `src/db/../lib/position.ts` as pure functions with no I/O — `db/*.ts` only ever receives an already-computed `position` value to persist.
- Query invalidation is the only error-recovery mechanism: if a position mutation fails, invalidating the relevant query keys refetches from SQLite (the source of truth) and the UI snaps back on its own. No manual local-state rollback.
- `src/lib/position.ts` is the one new module with automated tests (Vitest) — it's pure and doesn't need Tauri/SQLite running. Everything else in this phase (the actual dnd-kit interaction, SQLite persistence) is verified manually against the running app, same convention as Fases 1–2.
- Card/list mutations invalidate broadly (`["cards"]` for any card position change, regardless of which list(s) were involved) rather than tracking exact source/target list ids — simpler and correct for a single-user desktop app with a small number of lists.

---

### Task 1: Add dependencies and Vitest config

**Files:**
- Modify: `package.json` (via `npm install`)
- Create: `vitest.config.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` available to import from Task 6 onward; `npm test` runs Vitest, consumed by Task 2.

- [x] **Step 1: Install the drag-and-drop libraries**

Run: `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

- [x] **Step 2: Install Vitest as a dev dependency**

Run: `npm install -D vitest`

- [x] **Step 3: Add the `test` script to `package.json`**

In `package.json`, add `"test": "vitest run"` to the `"scripts"` object (alongside `"dev"`, `"build"`, `"preview"`, `"tauri"`).

- [x] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [x] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "Add dnd-kit and Vitest dependencies"
```

---

### Task 2: Position algorithm (`src/lib/position.ts`)

**Files:**
- Create: `src/lib/position.ts`
- Test: `src/lib/position.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces: `positionBetween(prev: number | null, next: number | null): number`, `needsRebalance(prev: number, next: number): boolean`, `rebalance<T extends { position: number }>(items: T[]): T[]`, `resolveInsertPosition(siblings: { id: number; position: number }[], targetIndex: number): { position: number; rebalanced?: { id: number; position: number }[] }`. All four consumed by Task 8 (`BoardView`).

- [x] **Step 1: Write the failing tests**

Create `src/lib/position.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { needsRebalance, positionBetween, rebalance, resolveInsertPosition } from "./position";

describe("positionBetween", () => {
  it("returns the midpoint between two positions", () => {
    expect(positionBetween(1, 2)).toBe(1.5);
  });

  it("returns prev + 1 when there is no next (append at end)", () => {
    expect(positionBetween(5, null)).toBe(6);
  });

  it("returns next - 1 when there is no prev (insert at start)", () => {
    expect(positionBetween(null, 3)).toBe(2);
  });

  it("returns 1 when the list is empty", () => {
    expect(positionBetween(null, null)).toBe(1);
  });
});

describe("needsRebalance", () => {
  it("is true when the gap between neighbors is too small", () => {
    expect(needsRebalance(1, 1.00000005)).toBe(true);
  });

  it("is false for a normal gap", () => {
    expect(needsRebalance(1, 2)).toBe(false);
  });
});

describe("rebalance", () => {
  it("renumbers items to sequential integers, preserving order and other fields", () => {
    const items = [
      { id: 10, position: 0.001 },
      { id: 20, position: 0.0011 },
      { id: 30, position: 5 },
    ];
    expect(rebalance(items)).toEqual([
      { id: 10, position: 1 },
      { id: 20, position: 2 },
      { id: 30, position: 3 },
    ]);
  });
});

describe("resolveInsertPosition", () => {
  it("computes a plain midpoint when the gap is healthy", () => {
    const siblings = [
      { id: 1, position: 1 },
      { id: 2, position: 2 },
    ];
    expect(resolveInsertPosition(siblings, 1)).toEqual({ position: 1.5 });
  });

  it("appends after the last item when inserting at the end", () => {
    const siblings = [{ id: 1, position: 1 }];
    expect(resolveInsertPosition(siblings, 1)).toEqual({ position: 2 });
  });

  it("triggers a rebalance when the gap has collapsed", () => {
    const siblings = [
      { id: 1, position: 1 },
      { id: 2, position: 1.00000005 },
      { id: 3, position: 2 },
    ];
    const result = resolveInsertPosition(siblings, 1);
    expect(result.rebalanced).toEqual([
      { id: 1, position: 1 },
      { id: 2, position: 2 },
      { id: 3, position: 3 },
    ]);
    expect(result.position).toBe(1.5);
  });
});
```

- [x] **Step 2: Run the tests and verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './position'` (the module doesn't exist yet).

- [x] **Step 3: Write `src/lib/position.ts`**

```ts
export function positionBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return 1;
  if (prev === null) return next! - 1;
  if (next === null) return prev + 1;
  return (prev + next) / 2;
}

export function needsRebalance(prev: number, next: number): boolean {
  return next - prev < 1e-7;
}

export function rebalance<T extends { position: number }>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, position: index + 1 }));
}

export function resolveInsertPosition(
  siblings: { id: number; position: number }[],
  targetIndex: number,
): { position: number; rebalanced?: { id: number; position: number }[] } {
  const prev = siblings[targetIndex - 1] ?? null;
  const next = siblings[targetIndex] ?? null;
  if (prev && next && needsRebalance(prev.position, next.position)) {
    const rebalanced = rebalance(siblings);
    const cleanPrev = rebalanced[targetIndex - 1] ?? null;
    const cleanNext = rebalanced[targetIndex] ?? null;
    return {
      position: positionBetween(cleanPrev?.position ?? null, cleanNext?.position ?? null),
      rebalanced,
    };
  }
  return { position: positionBetween(prev?.position ?? null, next?.position ?? null) };
}
```

- [x] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS — all 9 tests green.

- [x] **Step 5: Commit**

```bash
git add src/lib/position.ts src/lib/position.test.ts
git commit -m "Add fractional position algorithm with rebalancing"
```

---

### Task 3: DB layer — replace arrow-swap moves with position setters

**Files:**
- Modify: `src/db/cards.ts`
- Modify: `src/db/lists.ts`

**Interfaces:**
- Consumes: `getDb` from `./client` (unchanged).
- Produces: `updateCardPosition(id, position): Promise<void>`, `updateCardPositions(items): Promise<void>`, `moveCardToList(id, listId, position): Promise<void>` (`cards.ts`); `updateListPosition(id, position): Promise<void>`, `updateListPositions(items): Promise<void>` (`lists.ts`). All consumed by Task 4's hooks. Removes `moveCard` and `moveList`.

- [x] **Step 1: Replace `moveCard` in `src/db/cards.ts`**

Delete the existing `moveCard` function (the one that takes `direction: "up" | "down"` and swaps with a neighbor) and add these in its place:

```ts
export async function updateCardPosition(id: number, position: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE card SET position = $1 WHERE id = $2", [position, id]);
}

export async function updateCardPositions(items: { id: number; position: number }[]): Promise<void> {
  const db = await getDb();
  for (const item of items) {
    await db.execute("UPDATE card SET position = $1 WHERE id = $2", [item.position, item.id]);
  }
}

export async function moveCardToList(id: number, listId: number, position: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE card SET list_id = $1, position = $2 WHERE id = $3", [listId, position, id]);
}
```

The rest of `src/db/cards.ts` (`listCards`, `createCard`, `renameCard`, `archiveCard`, `countCards`) is unchanged.

- [x] **Step 2: Replace `moveList` in `src/db/lists.ts`**

Delete the existing `moveList` function (the one that takes `direction: "left" | "right"`) and add these in its place:

```ts
export async function updateListPosition(id: number, position: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE list SET position = $1 WHERE id = $2", [position, id]);
}

export async function updateListPositions(items: { id: number; position: number }[]): Promise<void> {
  const db = await getDb();
  for (const item of items) {
    await db.execute("UPDATE list SET position = $1 WHERE id = $2", [item.position, item.id]);
  }
}
```

The rest of `src/db/lists.ts` (`listLists`, `createList`, `renameList`, `deleteList`) is unchanged.

- [x] **Step 3: Commit**

```bash
git add src/db/cards.ts src/db/lists.ts
git commit -m "Replace arrow-swap moves with position setters in the DB layer"
```

---

### Task 4: Hooks layer

**Files:**
- Modify: `src/hooks/useCards.ts`
- Modify: `src/hooks/useLists.ts`

**Interfaces:**
- Consumes: Task 3's db functions; `useQueries` from `@tanstack/react-query`.
- Produces: `useCardsByListIds(listIds: number[])` (returns an array of query results, same order as `listIds`), `useUpdateCardPosition()`, `useUpdateCardPositions()`, `useMoveCardToList()` (`useCards.ts`); `useUpdateListPosition(boardId)`, `useUpdateListPositions(boardId)` (`useLists.ts`). All consumed by Task 8 (`BoardView`). Removes `useMoveCard` and `useMoveList`.

- [x] **Step 1: Rewrite `src/hooks/useCards.ts`**

Replace the whole file:

```ts
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveCard,
  countCards,
  createCard,
  listCards,
  moveCardToList,
  renameCard,
  updateCardPosition,
  updateCardPositions,
} from "../db/cards";

export function useCards(listId: number) {
  return useQuery({
    queryKey: ["cards", listId],
    queryFn: () => listCards(listId),
  });
}

export function useCardsByListIds(listIds: number[]) {
  return useQueries({
    queries: listIds.map((listId) => ({
      queryKey: ["cards", listId],
      queryFn: () => listCards(listId),
    })),
  });
}

export function useCardCount(listId: number) {
  return useQuery({
    queryKey: ["cardCount", listId],
    queryFn: () => countCards(listId),
  });
}

export function useCreateCard(listId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => createCard(listId, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards", listId] });
      queryClient.invalidateQueries({ queryKey: ["cardCount", listId] });
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards", listId] });
      queryClient.invalidateQueries({ queryKey: ["cardCount", listId] });
    },
  });
}

export function useUpdateCardPosition() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["cards"] });
  return useMutation({
    mutationFn: ({ id, position }: { id: number; position: number }) => updateCardPosition(id, position),
    onSuccess: invalidate,
    // If the write fails, invalidating anyway forces a refetch from SQLite (the source of
    // truth), which snaps the UI back to the last persisted state — no manual rollback needed.
    onError: invalidate,
  });
}

export function useUpdateCardPositions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["cards"] });
  return useMutation({
    mutationFn: (items: { id: number; position: number }[]) => updateCardPositions(items),
    onSuccess: invalidate,
    onError: invalidate,
  });
}

export function useMoveCardToList() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["cards"] });
    queryClient.invalidateQueries({ queryKey: ["cardCount"] });
  };
  return useMutation({
    mutationFn: ({ id, listId, position }: { id: number; listId: number; position: number }) =>
      moveCardToList(id, listId, position),
    onSuccess: invalidate,
    onError: invalidate,
  });
}
```

- [x] **Step 2: Rewrite `src/hooks/useLists.ts`**

Replace the whole file:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createList,
  deleteList,
  listLists,
  renameList,
  updateListPosition,
  updateListPositions,
} from "../db/lists";

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

export function useUpdateListPosition(boardId: number) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["lists", boardId] });
  return useMutation({
    mutationFn: ({ id, position }: { id: number; position: number }) => updateListPosition(id, position),
    onSuccess: invalidate,
    onError: invalidate,
  });
}

export function useUpdateListPositions(boardId: number) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["lists", boardId] });
  return useMutation({
    mutationFn: (items: { id: number; position: number }[]) => updateListPositions(items),
    onSuccess: invalidate,
    onError: invalidate,
  });
}
```

- [x] **Step 3: Commit**

```bash
git add src/hooks/useCards.ts src/hooks/useLists.ts
git commit -m "Add position-mutation hooks, remove arrow-swap hooks"
```

---

### Task 5: Protect the inline-edit input from drag capture

**Files:**
- Modify: `src/components/ui/InlineEditableText.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: same `<InlineEditableText>` public API as Fase 2, unchanged. Consumed by Tasks 6 and 7.

- [x] **Step 1: Add `onPointerDown` to the edit-mode `<input>`**

In `src/components/ui/InlineEditableText.tsx`, add an `onPointerDown` handler to the `<input>` element (inside the `if (editing)` branch):

```tsx
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
        onPointerDown={(e) => e.stopPropagation()}
      />
    );
  }
```

- [x] **Step 2: Commit**

```bash
git add src/components/ui/InlineEditableText.tsx
git commit -m "Stop pointerdown propagation in inline-edit input to protect text selection from drag"
```

---

### Task 6: Card component — draggable, no arrows

**Files:**
- Modify: `src/components/board/Card.tsx`

**Interfaces:**
- Consumes: `Card` type (`../../types`), `useRenameCard`/`useArchiveCard` (Task 4 — `useMoveCard` no longer exists), `InlineEditableText` (Task 5), `useSortable` from `@dnd-kit/sortable`, `CSS` from `@dnd-kit/utilities`.
- Produces: `<Card card={CardType} />` (no more `isFirst`/`isLast`), consumed by Task 7's `List`.

- [x] **Step 1: Replace `src/components/board/Card.tsx`**

```tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import type { Card as CardType } from "../../types";
import { useArchiveCard, useRenameCard } from "../../hooks/useCards";
import { InlineEditableText } from "../ui/InlineEditableText";

interface CardProps {
  card: CardType;
}

export function Card({ card }: CardProps) {
  const renameCard = useRenameCard(card.list_id);
  const archiveCard = useArchiveCard(card.list_id);
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: `card-${card.id}`,
    data: { type: "card", listId: card.list_id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab touch-none active:cursor-grabbing"
    >
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
        <button
          type="button"
          onClick={() => archiveCard.mutate(card.id)}
          className="rounded-lg px-1 text-text-muted hover:bg-accent-pink hover:text-bg-base"
          aria-label="Arquivar card"
        >
          ×
        </button>
      </motion.div>
    </div>
  );
}
```

`touch-none` on the outer `<div>` prevents the browser's own touch-scroll gesture from fighting the pointer sensor (recommended by `@dnd-kit` for any draggable element).

- [x] **Step 2: Commit**

```bash
git add src/components/board/Card.tsx
git commit -m "Make Card draggable via dnd-kit, remove up/down arrows"
```

---

### Task 7: List component — draggable header, droppable card area, no arrows

**Files:**
- Modify: `src/components/board/List.tsx`

**Interfaces:**
- Consumes: `List` type (`../../types`), `Card` type (`../../types`), `useCards` (no longer used — cards now arrive as a prop) / `useCardCount`/`useCreateCard` (Task 4, unchanged), `useRenameList`/`useDeleteList` (Task 4 — `useMoveList` no longer exists), `InlineEditableText` (Task 5), `Card` (Task 6), `useSortable`/`SortableContext`/`verticalListSortingStrategy` from `@dnd-kit/sortable`, `useDroppable` from `@dnd-kit/core`, `CSS` from `@dnd-kit/utilities`.
- Produces: `<List list={ListType} cards={CardType[]} />` (no more `boardId`/`isFirst`/`isLast` — `list.board_id` replaces the `boardId` prop), consumed by Task 8's `BoardView`.

- [x] **Step 1: Replace `src/components/board/List.tsx`**

```tsx
import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import type { Card as CardType, List as ListType } from "../../types";
import { useCardCount, useCreateCard } from "../../hooks/useCards";
import { useDeleteList, useRenameList } from "../../hooks/useLists";
import { InlineEditableText } from "../ui/InlineEditableText";
import { Card } from "./Card";

interface ListProps {
  list: ListType;
  cards: CardType[];
}

export function List({ list, cards }: ListProps) {
  const { data: cardCount } = useCardCount(list.id);
  const createCard = useCreateCard(list.id);
  const renameList = useRenameList(list.board_id);
  const deleteList = useDeleteList(list.board_id);
  const [newCardTitle, setNewCardTitle] = useState("");

  const canDelete = cardCount !== undefined && cardCount === 0;

  const sortable = useSortable({ id: `list-${list.id}`, data: { type: "list" } });
  const droppable = useDroppable({
    id: `cards-of-list-${list.id}`,
    data: { type: "list-container", listId: list.id },
  });

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
  };

  function handleAddCard() {
    const title = newCardTitle.trim();
    if (!title) return;
    createCard.mutate(title);
    setNewCardTitle("");
  }

  return (
    <div ref={sortable.setNodeRef} style={style} className="w-72 shrink-0">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-surface p-4"
      >
        <div
          {...sortable.attributes}
          {...sortable.listeners}
          className="flex cursor-grab items-center justify-between gap-2 touch-none active:cursor-grabbing"
        >
          <InlineEditableText
            value={list.name}
            onSave={(name) => renameList.mutate({ id: list.id, name })}
            className="text-lg font-semibold"
          />
          <button
            type="button"
            disabled={!canDelete}
            onClick={() => deleteList.mutate(list.id)}
            title={canDelete ? "Excluir coluna" : "Mova ou arquive os cards antes de excluir"}
            className="rounded-lg px-1 text-text-muted hover:bg-accent-pink hover:text-bg-base disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-muted"
            aria-label="Excluir coluna"
          >
            ×
          </button>
        </div>

        <div ref={droppable.setNodeRef} className="flex flex-col gap-2">
          <SortableContext items={cards.map((c) => `card-${c.id}`)} strategy={verticalListSortingStrategy}>
            {cards.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-3 text-center text-sm text-text-muted">
                Nenhum card ainda.
              </div>
            ) : (
              cards.map((card) => <Card key={card.id} card={card} />)
            )}
          </SortableContext>
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
    </div>
  );
}
```

Note the drag listeners (`sortable.attributes`/`sortable.listeners`) are on the **header row only**, not on the outer container — the outer container also holds the cards, which are themselves draggable via Task 6; attaching listeners to the whole container would make a pointerdown on a card also try to activate the list's own drag.

- [x] **Step 2: Commit**

```bash
git add src/components/board/List.tsx
git commit -m "Make List header draggable and its card area droppable, remove left/right arrows"
```

---

### Task 8: Wire dnd-kit into BoardView

**Files:**
- Modify: `src/components/board/BoardView.tsx`

**Interfaces:**
- Consumes: `useLists`/`useCreateList`/`useUpdateListPosition`/`useUpdateListPositions` (Task 4), `useCardsByListIds`/`useUpdateCardPosition`/`useUpdateCardPositions`/`useMoveCardToList` (Task 4), `resolveInsertPosition` (Task 2), `List` (Task 7), `DndContext`/`DragOverlay`/`PointerSensor`/`KeyboardSensor`/`pointerWithin`/`useSensor`/`useSensors`/`useDroppable` from `@dnd-kit/core`, `SortableContext`/`arrayMove`/`horizontalListSortingStrategy`/`sortableKeyboardCoordinates` from `@dnd-kit/sortable`.
- Produces: the fully wired drag-and-drop board, consumed by nothing else (leaf of the component tree along with `App`).

- [x] **Step 1: Replace `src/components/board/BoardView.tsx`**

```tsx
import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import {
  useCardsByListIds,
  useMoveCardToList,
  useUpdateCardPosition,
  useUpdateCardPositions,
} from "../../hooks/useCards";
import { useCreateList, useLists, useUpdateListPosition, useUpdateListPositions } from "../../hooks/useLists";
import { resolveInsertPosition } from "../../lib/position";
import type { Card as CardType, List as ListType } from "../../types";
import { List } from "./List";

interface BoardViewProps {
  boardId: number;
  boardName: string;
}

type BoardList = ListType & { cards: CardType[] };

export function BoardView({ boardId, boardName }: BoardViewProps) {
  const { data: lists, isLoading, error } = useLists(boardId);
  const listData = lists ?? [];
  const cardQueries = useCardsByListIds(listData.map((list) => list.id));
  const createList = useCreateList(boardId);
  const updateListPosition = useUpdateListPosition(boardId);
  const updateListPositions = useUpdateListPositions(boardId);
  const updateCardPosition = useUpdateCardPosition();
  const updateCardPositions = useUpdateCardPositions();
  const moveCardToList = useMoveCardToList();
  const [newListName, setNewListName] = useState("");

  const computedBoard: BoardList[] = listData.map((list, index) => ({
    ...list,
    cards: cardQueries[index]?.data ?? [],
  }));

  const [dragPreview, setDragPreview] = useState<BoardList[] | null>(null);
  const [activeCard, setActiveCard] = useState<CardType | null>(null);
  const [activeList, setActiveList] = useState<ListType | null>(null);
  const [dragSourceListId, setDragSourceListId] = useState<number | null>(null);

  const renderedBoard = dragPreview ?? computedBoard;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleAddList() {
    const name = newListName.trim();
    if (!name) return;
    createList.mutate(name);
    setNewListName("");
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { type?: string } | undefined;
    setDragPreview(computedBoard);
    if (data?.type === "card") {
      const activeId = String(event.active.id);
      const sourceList = computedBoard.find((l) => l.cards.some((c) => `card-${c.id}` === activeId));
      setActiveCard(sourceList?.cards.find((c) => `card-${c.id}` === activeId) ?? null);
      setDragSourceListId(sourceList?.id ?? null);
    } else if (data?.type === "list") {
      const activeId = String(event.active.id);
      setActiveList(computedBoard.find((l) => `list-${l.id}` === activeId) ?? null);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as { type?: string } | undefined;
    if (activeData?.type !== "card") return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    setDragPreview((prev) => {
      if (!prev) return prev;
      const sourceIndex = prev.findIndex((l) => l.cards.some((c) => `card-${c.id}` === activeId));
      if (sourceIndex === -1) return prev;

      const overData = over.data.current as { type?: string; listId?: number } | undefined;
      const targetListId =
        overData?.type === "card"
          ? prev.flatMap((l) => l.cards).find((c) => `card-${c.id}` === overId)?.list_id
          : overData?.type === "list-container"
            ? overData.listId
            : undefined;
      if (targetListId === undefined) return prev;

      const targetIndex = prev.findIndex((l) => l.id === targetListId);
      if (targetIndex === -1) return prev;

      const activeIndex = prev[sourceIndex].cards.findIndex((c) => `card-${c.id}` === activeId);
      const movingCard = prev[sourceIndex].cards[activeIndex];
      if (!movingCard) return prev;

      if (sourceIndex === targetIndex) {
        const overIndex = prev[targetIndex].cards.findIndex((c) => `card-${c.id}` === overId);
        if (overIndex === -1 || overIndex === activeIndex) return prev;
        const reordered = arrayMove(prev[targetIndex].cards, activeIndex, overIndex);
        const next = [...prev];
        next[targetIndex] = { ...next[targetIndex], cards: reordered };
        return next;
      }

      const sourceCards = [...prev[sourceIndex].cards];
      sourceCards.splice(activeIndex, 1);
      const targetCards = [...prev[targetIndex].cards];
      const overIndex = targetCards.findIndex((c) => `card-${c.id}` === overId);
      const insertAt = overIndex === -1 ? targetCards.length : overIndex;
      targetCards.splice(insertAt, 0, { ...movingCard, list_id: targetListId });

      const next = [...prev];
      next[sourceIndex] = { ...next[sourceIndex], cards: sourceCards };
      next[targetIndex] = { ...next[targetIndex], cards: targetCards };
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const activeData = active.data.current as { type?: string } | undefined;

    if (activeData?.type === "list" && over) {
      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId !== overId) {
        const oldIndex = computedBoard.findIndex((l) => `list-${l.id}` === activeId);
        const overIndex = computedBoard.findIndex((l) => `list-${l.id}` === overId);
        if (oldIndex !== -1 && overIndex !== -1) {
          const reordered = arrayMove(computedBoard, oldIndex, overIndex);
          const movedList = reordered[overIndex];
          const siblings = computedBoard
            .filter((l) => l.id !== movedList.id)
            .map((l) => ({ id: l.id, position: l.position }));
          const targetIndex = reordered.findIndex((l) => l.id === movedList.id);
          const { position, rebalanced } = resolveInsertPosition(siblings, targetIndex);
          if (rebalanced) updateListPositions.mutate(rebalanced);
          updateListPosition.mutate({ id: movedList.id, position });
        }
      }
    }

    if (activeData?.type === "card" && dragPreview && dragSourceListId !== null) {
      const activeId = String(active.id);
      let finalPreview = dragPreview;
      if (over) {
        const overId = String(over.id);
        const listIndex = finalPreview.findIndex((l) => l.cards.some((c) => `card-${c.id}` === activeId));
        if (listIndex !== -1) {
          const cards = finalPreview[listIndex].cards;
          const activeIndex = cards.findIndex((c) => `card-${c.id}` === activeId);
          const overIndex = cards.findIndex((c) => `card-${c.id}` === overId);
          if (overIndex !== -1 && overIndex !== activeIndex) {
            const reorderedCards = arrayMove(cards, activeIndex, overIndex);
            finalPreview = finalPreview.map((l, i) => (i === listIndex ? { ...l, cards: reorderedCards } : l));
          }
        }
      }

      const targetListIndex = finalPreview.findIndex((l) => l.cards.some((c) => `card-${c.id}` === activeId));
      if (targetListIndex !== -1) {
        const targetList = finalPreview[targetListIndex];
        const targetIndex = targetList.cards.findIndex((c) => `card-${c.id}` === activeId);
        const movedCard = targetList.cards[targetIndex];
        const siblings = targetList.cards
          .filter((c) => c.id !== movedCard.id)
          .map((c) => ({ id: c.id, position: c.position }));
        const { position, rebalanced } = resolveInsertPosition(siblings, targetIndex);
        if (rebalanced) updateCardPositions.mutate(rebalanced);
        if (targetList.id !== dragSourceListId) {
          moveCardToList.mutate({ id: movedCard.id, listId: targetList.id, position });
        } else {
          updateCardPosition.mutate({ id: movedCard.id, position });
        }
      }
    }

    setDragPreview(null);
    setActiveCard(null);
    setActiveList(null);
    setDragSourceListId(null);
  }

  function handleDragCancel(_event: DragCancelEvent) {
    setDragPreview(null);
    setActiveCard(null);
    setActiveList(null);
    setDragSourceListId(null);
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

  return (
    <div className="flex h-full flex-col p-6">
      <h1 className="mb-6 text-2xl font-semibold text-text-primary">{boardName}</h1>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex flex-1 items-start gap-4 overflow-x-auto">
          <SortableContext
            items={renderedBoard.map((l) => `list-${l.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            {renderedBoard.length === 0 ? (
              <div className="rounded-2xl border border-border bg-bg-surface p-6 text-text-muted">
                Nenhuma lista ainda.
              </div>
            ) : (
              renderedBoard.map((list) => <List key={list.id} list={list} cards={list.cards} />)
            )}
          </SortableContext>
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
        <DragOverlay>
          {activeCard ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-bg-elevated px-3 py-2 shadow-lg">
              <span className="flex-1 px-2 py-1">{activeCard.title}</span>
            </div>
          ) : activeList ? (
            <div className="flex w-72 flex-col gap-3 rounded-2xl border border-border bg-bg-surface p-4 shadow-lg">
              <span className="text-lg font-semibold">{activeList.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
```

- [x] **Step 2: Commit**

```bash
git add src/components/board/BoardView.tsx
git commit -m "Wire dnd-kit into BoardView: cross-list card drag and column reorder"
```

---

### Task 9: Manual end-to-end verification

**Files:** none (checklist only).

**Interfaces:** none.

- [x] **Step 1: Install and launch**

```bash
npm install
npm run tauri dev
```
Expected: window opens showing the existing board(s) from Fase 2, cards and lists with no arrow buttons anymore.

- [x] **Step 2: Reorder cards within a list**

Drag a card up/down within the same list by its body. Confirm it visually follows the cursor, other cards make room, and after dropping the new order persists (visible immediately, and still there after closing and reopening the app).

- [x] **Step 3: Move a card to a different list**

Drag a card from one list into another (drop it on top of an existing card, and separately drop it into empty space below all cards). Confirm both work, and confirm dropping into a list with **zero cards** also works (the "Nenhum card ainda." placeholder should accept the drop).

- [x] **Step 4: Reorder columns**

Drag a list by its header (title area) to a different position. Confirm the column order changes and persists after restarting the app.

- [x] **Step 5: Confirm editing and archiving still work**

Double-click a card title or list name to rename it (confirm dragging doesn't start accidentally, and that clicking-and-dragging inside the rename input selects text instead of dragging the card). Click "×" on a card to archive it. Confirm the list delete button is still disabled when the list has cards, and enabled once empty.

- [x] **Step 6: Keyboard drag**

Tab to focus a card (or a list header), press Space to pick it up, use arrow keys to move it, press Space again to drop. Confirm this works for both cards and lists.

- [x] **Step 7: Rebalancing (optional stress test)**

Reorder the same card into the same in-between spot repeatedly (e.g., drag it one position and back, several times) — this is the scenario most likely to collapse the float gap. Confirm the app doesn't error out; if you want to verify a rebalance actually fired, `src/lib/position.ts`'s own unit tests (Task 2) already cover the logic in isolation.

- [x] **Step 8: Report back**

Tell me what you saw (all working / anything that didn't match). If everything matches, Fase 3 is done.
