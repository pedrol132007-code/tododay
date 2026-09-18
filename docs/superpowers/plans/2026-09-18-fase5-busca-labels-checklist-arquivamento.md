# Fase 5 — Busca, Labels, Checklist, Arquivamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** The last item on the master spec's phase list. Four features, each independently useful, built in this order because each is self-contained and the later ones (search) benefit from the earlier ones (labels/checklist) already existing to search around:

1. **Labels** — create/delete per-board labels, toggle them on a card from its detail panel, see them as chips on the card face.
2. **Checklist** — add/toggle/delete checklist items in the detail panel, see progress ("2/5") on the card face.
3. **Arquivamento** — a per-board view of archived cards (already archivable since Fase 2) with restore and permanent delete.
4. **Busca** — `Ctrl+K` opens a global command palette searching card titles/descriptions across all boards; picking a result switches board (if needed) and opens that card's detail panel.

**Architecture:** New `src/db/labels.ts`, `src/db/checklistItems.ts`, `src/db/search.ts` (no SQL outside `db/*.ts`, per convention). New `src/hooks/useLabels.ts`, `src/hooks/useChecklistItems.ts`, `src/hooks/useSearch.ts`, plus archive-related additions to `src/hooks/useCards.ts` (archiving is a card concern, same file that already owns `useArchiveCard`). New components: `src/components/card-detail/LabelPicker.tsx`, `src/components/card-detail/Checklist.tsx`, `src/components/archive/ArchiveView.tsx`, `src/components/search/CommandPalette.tsx`. `Card` and `List` gain small additive props for the card-face indicators; `App.tsx` gains the top-level view switch (board / archive) and owns the global `Ctrl+K` listener.

**Tech Stack:** Same as Fases 1–4, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-17-kanban-desktop-design.md` — modelo de dados (`label`, `card_label`, `checklist_item`), atalhos (`Ctrl+K`), estrutura de pastas (`search/`, `archive/`).

## Global Constraints

- **Card-face indicators are in scope** even though the spec doesn't spell them out: label chips and a checklist progress badge on each card, batched per list (one query per list per indicator type, not one per card — same N+1 concern the Fase 3 `useCardsByListIds` pattern already solves for cards themselves).
- **`Card` type stays exactly as-is** (mirrors the `card` table per `CLAUDE.md`). Label/checklist-progress data for the board face is fetched and passed down as separate props, never merged into the `Card` type.
- **Archive is per-board**, matching every other board-scoped view in the app. `ArchiveView` replaces the board view in place (a mode toggle in `App.tsx`), not a modal — consistent with it being a full `*View` component per the spec's folder listing, parallel to `BoardView`.
- **Search is global across all boards** (spec: "Busca global"). `CommandPalette` is a `Ctrl+K`-triggered overlay/modal (spec names it after VS Code-style command palettes), separate from `ArchiveView`'s full-page style. Picking a result switches `App.tsx`'s active board if needed, then opens that card's detail panel.
- **No `src/lib/shortcuts.ts` registry yet.** This phase adds exactly one new *global* shortcut consumer (`Ctrl+K` in `App.tsx`); `Esc`-to-close is already handled locally inside `CardDetailPanel` (Fase 4) and `CommandPalette` will own its own local `Esc` the same way. Still only one call site needing app-wide coordination — a shared registry module for one consumer is premature. Revisit if a later addition needs to coordinate 3+ shortcuts across components.
- **Checklist items are append-only ordered** (`MAX(position) + 1` on insert, like cards/lists on creation) — no drag-and-drop reordering. Not asked for, and the existing fractional-position machinery is already more than a flat checklist needs.
- **Label color is a free-form string** rendered via inline `style={{ backgroundColor: label.color }}`, never a fixed Tailwind class set — colors aren't known at build time (spec: "não limitadas à paleta base"). Use `<input type="color">` for picking one; no custom color-swatch picker.
- **Restoring a card** just clears `archived_at` (`UPDATE card SET archived_at = NULL WHERE id = $1`) and leaves `position` untouched. Verified safe: `createCard`'s `MAX(position)` query already has no `archived_at` filter, so archived cards' positions were never "freed" for reuse by cards created after the archive — the old slot is still exclusively the restored card's.
- **Permanent delete is the app's first irreversible action.** No native `confirm()` (breaks the app's custom dark-purple visual identity) and no new modal component for a single use — `ArchiveView`'s delete button flips to "Confirmar exclusão?" on first click and only deletes on the second click within a few seconds (reverts to "Excluir" on blur/timeout). `card_label` and `checklist_item` rows cascade automatically (`ON DELETE CASCADE`, Fase 1 schema) — no app-level cleanup needed.
- **Search is capped and simple:** `LIKE`-based substring match on `title`/`description`, excludes archived cards, `LIMIT 20`, ordered by `updated_at DESC`. No full-text index, ranking, or fuzzy matching — over-engineering for a single-user local board.
- Mutations follow the existing scoped-invalidation convention (`["cards", listId]`, `["cards", cardId]` where a new per-card key is introduced for labels/checklist) rather than the broad `["cards"]` invalidation reserved for drag operations.

---

### Task 1: DB layer — labels

**Files:** Create `src/db/labels.ts`

**Interfaces:**
- Produces: `listLabels(boardId): Promise<Label[]>`, `createLabel(boardId, name, color): Promise<number>`, `deleteLabel(id): Promise<void>`, `listCardLabels(cardId): Promise<Label[]>`, `listLabelsForCards(cardIds: number[]): Promise<Map<number, Label[]>>`, `setCardLabel(cardId, labelId, on: boolean): Promise<void>`. Consumed by Task 4's hooks.

- [x] **Step 1:** Write `src/db/labels.ts`:
  ```ts
  import { getDb } from "./client";
  import type { Label } from "../types";

  export async function listLabels(boardId: number): Promise<Label[]> {
    const db = await getDb();
    return db.select<Label[]>("SELECT * FROM label WHERE board_id = $1 ORDER BY id ASC", [boardId]);
  }

  export async function createLabel(boardId: number, name: string, color: string): Promise<number> {
    const db = await getDb();
    const result = await db.execute(
      "INSERT INTO label (board_id, name, color) VALUES ($1, $2, $3)",
      [boardId, name, color],
    );
    return result.lastInsertId ?? 0;
  }

  export async function deleteLabel(id: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM label WHERE id = $1", [id]);
  }

  export async function listCardLabels(cardId: number): Promise<Label[]> {
    const db = await getDb();
    return db.select<Label[]>(
      "SELECT label.* FROM label JOIN card_label ON label.id = card_label.label_id WHERE card_label.card_id = $1",
      [cardId],
    );
  }

  export async function listLabelsForCards(cardIds: number[]): Promise<Map<number, Label[]>> {
    const map = new Map<number, Label[]>();
    if (cardIds.length === 0) return map;
    const db = await getDb();
    const placeholders = cardIds.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await db.select<(Label & { card_id: number })[]>(
      `SELECT label.*, card_label.card_id FROM label
       JOIN card_label ON label.id = card_label.label_id
       WHERE card_label.card_id IN (${placeholders})`,
      cardIds,
    );
    for (const { card_id, ...label } of rows) {
      const existing = map.get(card_id) ?? [];
      existing.push(label);
      map.set(card_id, existing);
    }
    return map;
  }

  export async function setCardLabel(cardId: number, labelId: number, on: boolean): Promise<void> {
    const db = await getDb();
    if (on) {
      await db.execute("INSERT OR IGNORE INTO card_label (card_id, label_id) VALUES ($1, $2)", [cardId, labelId]);
    } else {
      await db.execute("DELETE FROM card_label WHERE card_id = $1 AND label_id = $2", [cardId, labelId]);
    }
  }
  ```
- [x] **Step 2: Commit**
  ```bash
  git add src/db/labels.ts
  git commit -m "Add label CRUD and card-label association queries"
  ```

---

### Task 2: DB layer — checklist items

**Files:** Create `src/db/checklistItems.ts`

**Interfaces:**
- Produces: `listChecklistItems(cardId): Promise<ChecklistItem[]>`, `createChecklistItem(cardId, text): Promise<number>`, `toggleChecklistItem(id, done): Promise<void>`, `deleteChecklistItem(id): Promise<void>`, `listChecklistProgressForCards(cardIds: number[]): Promise<Map<number, { done: number; total: number }>>`. Consumed by Task 4's hooks.
- `checklist_item.done` is `INTEGER` 0/1 in SQLite — this layer converts to/from `boolean` before it leaves `db/*.ts`, per `CLAUDE.md`.

- [x] **Step 1:** Write `src/db/checklistItems.ts`:
  ```ts
  import { getDb } from "./client";
  import type { ChecklistItem } from "../types";

  type ChecklistItemRow = Omit<ChecklistItem, "done"> & { done: number };

  function toChecklistItem(row: ChecklistItemRow): ChecklistItem {
    return { ...row, done: row.done === 1 };
  }

  export async function listChecklistItems(cardId: number): Promise<ChecklistItem[]> {
    const db = await getDb();
    const rows = await db.select<ChecklistItemRow[]>(
      "SELECT * FROM checklist_item WHERE card_id = $1 ORDER BY position ASC",
      [cardId],
    );
    return rows.map(toChecklistItem);
  }

  export async function createChecklistItem(cardId: number, text: string): Promise<number> {
    const db = await getDb();
    const maxPosition = await db.select<{ maxPosition: number | null }[]>(
      "SELECT MAX(position) as maxPosition FROM checklist_item WHERE card_id = $1",
      [cardId],
    );
    const position = (maxPosition[0]?.maxPosition ?? 0) + 1;
    const result = await db.execute(
      "INSERT INTO checklist_item (card_id, text, position) VALUES ($1, $2, $3)",
      [cardId, text, position],
    );
    return result.lastInsertId ?? 0;
  }

  export async function toggleChecklistItem(id: number, done: boolean): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE checklist_item SET done = $1 WHERE id = $2", [done ? 1 : 0, id]);
  }

  export async function deleteChecklistItem(id: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM checklist_item WHERE id = $1", [id]);
  }

  export async function listChecklistProgressForCards(
    cardIds: number[],
  ): Promise<Map<number, { done: number; total: number }>> {
    const map = new Map<number, { done: number; total: number }>();
    if (cardIds.length === 0) return map;
    const db = await getDb();
    const placeholders = cardIds.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await db.select<{ card_id: number; done: number; total: number }[]>(
      `SELECT card_id, SUM(done) as done, COUNT(*) as total FROM checklist_item
       WHERE card_id IN (${placeholders}) GROUP BY card_id`,
      cardIds,
    );
    for (const row of rows) map.set(row.card_id, { done: row.done, total: row.total });
    return map;
  }
  ```
- [x] **Step 2: Commit**
  ```bash
  git add src/db/checklistItems.ts
  git commit -m "Add checklist item CRUD and batched progress query"
  ```

---

### Task 3: DB layer — archive and search

**Files:** Modify `src/db/cards.ts`; Create `src/db/search.ts`

**Interfaces:**
- Produces: `listArchivedCards(boardId): Promise<Card[]>`, `restoreCard(id): Promise<void>`, `deleteCardPermanently(id): Promise<void>` (`cards.ts`); `searchCards(query): Promise<SearchResult[]>` (`search.ts`, new `SearchResult` type added to `src/types/index.ts`).

- [x] **Step 1:** Add to `src/db/cards.ts`:
  ```ts
  export async function listArchivedCards(boardId: number): Promise<Card[]> {
    const db = await getDb();
    return db.select<Card[]>(
      `SELECT card.* FROM card JOIN list ON card.list_id = list.id
       WHERE list.board_id = $1 AND card.archived_at IS NOT NULL
       ORDER BY card.archived_at DESC`,
      [boardId],
    );
  }

  export async function restoreCard(id: number): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE card SET archived_at = NULL WHERE id = $1", [id]);
  }

  export async function deleteCardPermanently(id: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM card WHERE id = $1", [id]);
  }
  ```
- [x] **Step 2:** Add `SearchResult` to `src/types/index.ts` (alongside the other interfaces):
  ```ts
  export interface SearchResult {
    id: number;
    title: string;
    list_id: number;
    board_id: number;
    board_name: string;
  }
  ```
- [x] **Step 3:** Write `src/db/search.ts`:
  ```ts
  import { getDb } from "./client";
  import type { SearchResult } from "../types";

  export async function searchCards(query: string): Promise<SearchResult[]> {
    const db = await getDb();
    const like = `%${query}%`;
    return db.select<SearchResult[]>(
      `SELECT card.id, card.title, card.list_id, list.board_id, board.name as board_name
       FROM card
       JOIN list ON card.list_id = list.id
       JOIN board ON list.board_id = board.id
       WHERE card.archived_at IS NULL AND (card.title LIKE $1 OR card.description LIKE $1)
       ORDER BY card.updated_at DESC
       LIMIT 20`,
      [like],
    );
  }
  ```
- [x] **Step 4: Commit**
  ```bash
  git add src/db/cards.ts src/db/search.ts src/types/index.ts
  git commit -m "Add archive queries and global card search"
  ```

---

### Task 4: Hooks — labels, checklist, archive, search

**Files:** Create `src/hooks/useLabels.ts`, `src/hooks/useChecklistItems.ts`, `src/hooks/useSearch.ts`; Modify `src/hooks/useCards.ts`

**Interfaces:**
- Produces: `useLabels(boardId)`, `useCardLabels(cardId)`, `useLabelsForCards(cardIds)`, `useCreateLabel(boardId)`, `useDeleteLabel(boardId)`, `useSetCardLabel(cardId)` (`useLabels.ts`); `useChecklistItems(cardId)`, `useChecklistProgressForCards(cardIds)`, `useCreateChecklistItem(cardId)`, `useToggleChecklistItem(cardId)`, `useDeleteChecklistItem(cardId)` (`useChecklistItems.ts`); `useSearch(query)` (`useSearch.ts`); `useArchivedCards(boardId)`, `useRestoreCard(boardId)`, `useDeleteCardPermanently(boardId)` (`useCards.ts`). Consumed by Task 5–9's components.

- [x] **Step 1:** Write `src/hooks/useLabels.ts`:
  ```ts
  import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
  import {
    createLabel,
    deleteLabel,
    listCardLabels,
    listLabels,
    listLabelsForCards,
    setCardLabel,
  } from "../db/labels";

  export function useLabels(boardId: number) {
    return useQuery({ queryKey: ["labels", boardId], queryFn: () => listLabels(boardId) });
  }

  export function useCardLabels(cardId: number) {
    return useQuery({ queryKey: ["cardLabels", cardId], queryFn: () => listCardLabels(cardId) });
  }

  export function useLabelsForCards(cardIds: number[]) {
    return useQuery({
      queryKey: ["labelsForCards", cardIds],
      queryFn: () => listLabelsForCards(cardIds),
    });
  }

  export function useCreateLabel(boardId: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ name, color }: { name: string; color: string }) => createLabel(boardId, name, color),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["labels", boardId] }),
    });
  }

  export function useDeleteLabel(boardId: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: number) => deleteLabel(id),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["labels", boardId] });
        queryClient.invalidateQueries({ queryKey: ["cardLabels"] });
        queryClient.invalidateQueries({ queryKey: ["labelsForCards"] });
      },
    });
  }

  export function useSetCardLabel(cardId: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ labelId, on }: { labelId: number; on: boolean }) => setCardLabel(cardId, labelId, on),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["cardLabels", cardId] });
        queryClient.invalidateQueries({ queryKey: ["labelsForCards"] });
      },
    });
  }
  ```
- [x] **Step 2:** Write `src/hooks/useChecklistItems.ts` (mirror shape, wrapping `src/db/checklistItems.ts`; `useChecklistProgressForCards(cardIds)` queryKey `["checklistProgress", cardIds]`; mutations invalidate `["checklistItems", cardId]` and `["checklistProgress"]`).
- [x] **Step 3:** Write `src/hooks/useSearch.ts`:
  ```ts
  import { useQuery } from "@tanstack/react-query";
  import { searchCards } from "../db/search";

  export function useSearch(query: string) {
    return useQuery({
      queryKey: ["search", query],
      queryFn: () => searchCards(query),
      enabled: query.trim().length > 0,
    });
  }
  ```
- [x] **Step 4:** Add to `src/hooks/useCards.ts`:
  ```ts
  export function useArchivedCards(boardId: number) {
    return useQuery({ queryKey: ["archivedCards", boardId], queryFn: () => listArchivedCards(boardId) });
  }

  export function useRestoreCard(boardId: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: number) => restoreCard(id),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["archivedCards", boardId] });
        queryClient.invalidateQueries({ queryKey: ["cards"] });
      },
    });
  }

  export function useDeleteCardPermanently(boardId: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: number) => deleteCardPermanently(id),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["archivedCards", boardId] }),
    });
  }
  ```
  (Import `listArchivedCards`, `restoreCard`, `deleteCardPermanently` from `../db/cards` alongside the existing imports.)
- [x] **Step 5: Commit**
  ```bash
  git add src/hooks/useLabels.ts src/hooks/useChecklistItems.ts src/hooks/useSearch.ts src/hooks/useCards.ts
  git commit -m "Add label, checklist, search, and archive hooks"
  ```

---

### Task 5: `LabelPicker` component

**Files:** Create `src/components/card-detail/LabelPicker.tsx`

**Interfaces:** `<LabelPicker boardId={number} cardId={number} />`. Consumed by Task 8 (`CardDetailPanel`).

- [x] **Step 1:** Build a small popover (click a "+ Labels" button to open/close, no external popover library — a simple `useState` boolean and an absolutely-positioned `div`, dismissed by clicking its own backdrop or pressing `Escape`, matching the app's existing lightweight-modal patterns from `CardDetailPanel`). Contents: current card's labels as removable chips (`useCardLabels`, click × calls `useSetCardLabel(cardId).mutate({ labelId, on: false })`); the board's full label list (`useLabels(boardId)`) as toggleable chips (click toggles `useSetCardLabel`, comparing against the card's current label ids); a small inline form (text input + `<input type="color">` + "Adicionar" button) calling `useCreateLabel(boardId)`; a × per board-label row calling `useDeleteLabel(boardId)` to remove it everywhere.
- [x] **Step 2: Commit**
  ```bash
  git add src/components/card-detail/LabelPicker.tsx
  git commit -m "Add LabelPicker for toggling and managing card labels"
  ```

---

### Task 6: `Checklist` component

**Files:** Create `src/components/card-detail/Checklist.tsx`

**Interfaces:** `<Checklist cardId={number} />`. Consumed by Task 8 (`CardDetailPanel`).

- [x] **Step 1:** List items (`useChecklistItems(cardId)`) each as a checkbox (`useToggleChecklistItem`) + text + a × (`useDeleteChecklistItem`); a "Progresso: done/total" line above the list; a text input + "Adicionar" button at the bottom (`useCreateChecklistItem`, `Enter` key also submits, same pattern as the board's "Novo card..." input).
- [x] **Step 2: Commit**
  ```bash
  git add src/components/card-detail/Checklist.tsx
  git commit -m "Add Checklist for card checklist items"
  ```

---

### Task 7: Card-face indicators

**Files:** Modify `src/components/board/Card.tsx`, `src/components/board/List.tsx`, `src/components/board/BoardView.tsx`

**Interfaces:** `Card` gains `labels?: Label[]` and `checklistProgress?: { done: number; total: number }` props (not the `Card` *type* — these stay separate component props). `List` and `BoardView` thread the batched maps down.

- [x] **Step 1:** In `BoardView.tsx`, batch-fetch `useLabelsForCards` and `useChecklistProgressForCards` once for all card ids currently on the board (`computedBoard.flatMap((l) => l.cards.map((c) => c.id))`), and pass the two resulting `Map`s down through `List` to `Card` (same prop-threading pattern already used for `onOpenDetail`).
- [x] **Step 2:** In `Card.tsx`, render label chips (small colored dots or pills, `title` attribute showing the name) above the title row if `labels.length > 0`, and a small "✓ done/total" badge next to the archive button if `checklistProgress.total > 0`.
- [x] **Step 3: Commit**
  ```bash
  git add src/components/board/Card.tsx src/components/board/List.tsx src/components/board/BoardView.tsx
  git commit -m "Show label chips and checklist progress on the card face"
  ```

---

### Task 8: Wire `LabelPicker` and `Checklist` into `CardDetailPanel`

**Files:** Modify `src/components/card-detail/CardDetailPanel.tsx`

- [x] **Step 1:** Add `<LabelPicker boardId={...} cardId={card.id} />` and `<Checklist cardId={card.id} />` sections to the panel, below the due-date field and above/below the description (`LabelPicker` near the top with the metadata, `Checklist` after the description). `CardDetailPanel` doesn't currently receive `boardId` — thread it down from `BoardView` as a new prop (`CardDetailPanel`'s `card.list_id` isn't enough to know the board id without another lookup, so pass `boardId` explicitly, same value `BoardView` already has).
- [x] **Step 2: Commit**
  ```bash
  git add src/components/card-detail/CardDetailPanel.tsx src/components/board/BoardView.tsx
  git commit -m "Wire LabelPicker and Checklist into CardDetailPanel"
  ```

---

### Task 9: `ArchiveView` + board/archive toggle

**Files:** Create `src/components/archive/ArchiveView.tsx`; Modify `src/App.tsx`

**Interfaces:** `<ArchiveView boardId={number} boardName={string} onBack={() => void} />`.

- [x] **Step 1:** Build `ArchiveView`: header ("Arquivados — {boardName}" + a "Voltar" button calling `onBack`), list of `useArchivedCards(boardId)` each showing title + a "Restaurar" button (`useRestoreCard`) + a delete button implementing the two-click confirm pattern described in Global Constraints (local `useState` per-row: first click sets a `confirmingId` state and relabels that row's button "Confirmar exclusão?"; second click while `confirmingId === card.id` calls `useDeleteCardPermanently`; clicking elsewhere or a few seconds of inactivity resets `confirmingId` to `null`).
- [x] **Step 2:** In `App.tsx`, add `const [showArchive, setShowArchive] = useState(false)` and a "Arquivados" button next to `BoardSwitcher`; render `<ArchiveView .../>` instead of `<BoardView .../>` when `showArchive` is true, with `onBack={() => setShowArchive(false)}`.
- [x] **Step 3: Commit**
  ```bash
  git add src/components/archive/ArchiveView.tsx src/App.tsx
  git commit -m "Add ArchiveView with restore and confirmed permanent delete"
  ```

---

### Task 10: `CommandPalette` (global search)

**Files:** Create `src/components/search/CommandPalette.tsx`; Modify `src/App.tsx`

**Interfaces:** `<CommandPalette onNavigate={(result: SearchResult) => void} onClose={() => void} />`.

- [x] **Step 1:** Build `CommandPalette`: full-screen backdrop (click closes) + a centered input (autofocus) + a live results list from `useSearch(query)` (debounce not required at this data scale — one query per keystroke against a local SQLite file is fine), each result showing the card title and "{list} · {board}" context; clicking a result or pressing `Enter` on the first result calls `onNavigate(result)`; `Escape` calls `onClose`. Same visual language as `CardDetailPanel` (backdrop + `framer-motion` fade, dark-purple surface).
- [x] **Step 2:** In `App.tsx`: add `const [paletteOpen, setPaletteOpen] = useState(false)`; a `useEffect` document `keydown` listener toggling it open on `Ctrl+K`/`Cmd+K` (`e.preventDefault()` so the browser's own address-bar-style shortcut, if any, doesn't fire); render `<CommandPalette>` (wrapped in `AnimatePresence`) when open, with `onNavigate` setting `activeBoardId` to `result.board_id`, closing the palette, exiting archive mode if active, and setting a new `pendingCardId` state that `BoardView` reads to auto-open that card's detail panel once its lists/cards have loaded (pass `initialSelectedCardId` as a new optional `BoardView` prop, consumed once in a `useEffect` that calls the existing `setSelectedCardId`).
- [x] **Step 3: Commit**
  ```bash
  git add src/components/search/CommandPalette.tsx src/App.tsx src/components/board/BoardView.tsx
  git commit -m "Add global Ctrl+K command palette with cross-board navigation"
  ```

---

### Task 11: Manual end-to-end verification

**Files:** none (checklist only).

- [x] **Step 1:** `npm install && npm run tauri dev`. Confirm no regressions in board/drag/detail-panel behavior from Fases 2–4.
- [x] **Step 2: Labels.** Open a card, create 2-3 labels with different colors, toggle a couple onto the card, close the panel — confirm the chips show on the card face. Delete one label from the picker — confirm it disappears from every card that had it (cascade) and from the picker's list.
- [x] **Step 3: Checklist.** Add several checklist items to a card, toggle a few done, delete one. Confirm the "done/total" badge on the card face matches and updates live.
- [x] **Step 4: Archive.** Archive a card from the board (existing × button). Open "Arquivados" — confirm it's listed. Click Restaurar — confirm it reappears on the board in roughly its old spot. Archive it again, then delete permanently: confirm the button requires two clicks (first shows "Confirmar exclusão?"), and after confirming, the card is gone for good (reopen the app to be sure it didn't come back).
- [x] **Step 5: Search.** Press `Ctrl+K` from anywhere. Search for a card title that exists on a *different* board than the currently active one. Confirm selecting it switches boards and opens that card's detail panel. Confirm `Esc` closes the palette without navigating.
- [x] **Step 6: Report back.** Tell me what you saw. If everything matches, Fase 5 — and the whole master spec — is done.
