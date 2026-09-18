# Fase 4 — Painel de Detalhe do Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Clicking a card opens a side panel showing/editing its title, markdown description, and due date. Closes via Esc, backdrop click, the × button, or `Ctrl+Enter` (while focus is in the description textarea, which also saves).

**Architecture:** New `src/components/card-detail/` folder: `CardDetailPanel` (backdrop + sliding aside, owns Esc handling) and `MarkdownEditor` (edit/preview toggle for the description, owns `Ctrl+Enter`). `BoardView` owns `selectedCardId` state and renders the panel; `Card` gains an `onOpenDetail` prop threaded through `List`. No new DB tables or migrations — `description` and `due_date` already exist on `card` (Fase 1).

**Tech Stack:** Same as Fases 1–3, plus `react-markdown` + `remark-gfm` (markdown preview, per the master spec).

**Spec:** `docs/superpowers/specs/2026-09-17-kanban-desktop-design.md` — identidade visual, atalhos de teclado (`Esc`, `Ctrl+Enter`), estrutura de pastas (`card-detail/`).

## Global Constraints

- **Out of scope for this phase** (explicitly Fase 5 per the master spec): labels, checklist, archiving from the panel, search. The panel only handles title, description, due date.
- **Title editing** reuses `InlineEditableText` (no new rename UI) — same component already used on the board.
- **`due_date`** is stored and rendered as a plain `YYYY-MM-DD` string (no time component), matching `<input type="date">`'s value format directly — no timezone conversion needed anywhere.
- **Click-to-open must not fight double-click-to-rename or the archive button.** `InlineEditableText`'s display-mode `<span>` and `Card`'s archive `<button>` must both call `e.stopPropagation()` on `onClick` so a click on the title or the × never bubbles to the card's own `onClick` (which opens the panel). This mirrors the existing `onPointerDown` stopPropagation already in `InlineEditableText`'s edit-mode `<input>` (Fase 3) — same problem, click instead of pointerdown.
- **No new keyboard-shortcut registry module.** The master spec's folder listing mentions `src/lib/shortcuts.ts` as a future central registry, but this phase only needs two shortcuts (`Esc`, `Ctrl+Enter`), both scoped to one component each — a shared module for two call sites is premature. Build the registry in whichever later phase actually needs to coordinate shortcuts across components (e.g. `Ctrl+K` search in Fase 5).
- Mutations follow the existing `useRenameCard`/`useArchiveCard` convention: scoped invalidation by `listId` (known from `card.list_id`), not the broad `["cards"]` invalidation used only for drag position updates (that broad invalidation was a deliberate Fase 3 tradeoff for drag gestures that can span lists — doesn't apply here).
- Query invalidation is still the only error-recovery mechanism (no manual rollback), same convention as Fases 1–3.

---

### Task 1: Add `react-markdown` + `remark-gfm`

**Files:** Modify: `package.json` (via `npm install`)

- [x] **Step 1:** Run `npm install react-markdown remark-gfm`
- [x] **Step 2: Commit**
  ```bash
  git add package.json package-lock.json
  git commit -m "Add react-markdown and remark-gfm for card description preview"
  ```

---

### Task 2: DB layer — description and due date

**Files:** Modify: `src/db/cards.ts`

**Interfaces:**
- Produces: `updateCardDescription(id: number, description: string): Promise<void>`, `updateCardDueDate(id: number, dueDate: string | null): Promise<void>`. Consumed by Task 3's hooks.

- [x] **Step 1:** Add to `src/db/cards.ts` (alongside `renameCard`):
  ```ts
  export async function updateCardDescription(id: number, description: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE card SET description = $1, updated_at = datetime('now') WHERE id = $2",
      [description, id],
    );
  }

  export async function updateCardDueDate(id: number, dueDate: string | null): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE card SET due_date = $1, updated_at = datetime('now') WHERE id = $2",
      [dueDate, id],
    );
  }
  ```
- [x] **Step 2: Commit**
  ```bash
  git add src/db/cards.ts
  git commit -m "Add description and due-date update queries"
  ```

---

### Task 3: Hooks — description and due date

**Files:** Modify: `src/hooks/useCards.ts`

**Interfaces:**
- Consumes: Task 2's db functions.
- Produces: `useUpdateCardDescription(listId: number)`, `useUpdateCardDueDate(listId: number)` — same shape as `useRenameCard`. Consumed by Task 6/7 (`CardDetailPanel`).

- [x] **Step 1:** Add to `src/hooks/useCards.ts` (alongside `useRenameCard`), importing `updateCardDescription`/`updateCardDueDate` from `../db/cards`:
  ```ts
  export function useUpdateCardDescription(listId: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, description }: { id: number; description: string }) =>
        updateCardDescription(id, description),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", listId] }),
    });
  }

  export function useUpdateCardDueDate(listId: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, dueDate }: { id: number; dueDate: string | null }) =>
        updateCardDueDate(id, dueDate),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", listId] }),
    });
  }
  ```
- [x] **Step 2: Commit**
  ```bash
  git add src/hooks/useCards.ts
  git commit -m "Add description and due-date mutation hooks"
  ```

---

### Task 4: Protect click-to-open from title/archive clicks

**Files:** Modify: `src/components/ui/InlineEditableText.tsx`, `src/components/board/Card.tsx`

- [x] **Step 1:** In `InlineEditableText.tsx`'s display-mode `<span>`, add `onClick={(e) => e.stopPropagation()}` alongside the existing `onDoubleClick`.
- [x] **Step 2:** In `Card.tsx`'s archive `<button>`, change `onClick={() => archiveCard.mutate(card.id)}` to stop propagation first:
  ```tsx
  onClick={(e) => {
    e.stopPropagation();
    archiveCard.mutate(card.id);
  }}
  ```
- [x] **Step 3: Commit**
  ```bash
  git add src/components/ui/InlineEditableText.tsx src/components/board/Card.tsx
  git commit -m "Stop click propagation on title and archive button before wiring card-open"
  ```

---

### Task 5: `MarkdownEditor` component

**Files:** Create: `src/components/card-detail/MarkdownEditor.tsx`

**Interfaces:**
- Produces: `<MarkdownEditor value={string} onSave={(v: string) => void} onSaveAndClose={() => void} />`. Consumed by Task 7 (`CardDetailPanel`).

- [x] **Step 1:** Write `src/components/card-detail/MarkdownEditor.tsx`:
  ```tsx
  import { useState } from "react";
  import ReactMarkdown from "react-markdown";
  import remarkGfm from "remark-gfm";

  interface MarkdownEditorProps {
    value: string;
    onSave: (value: string) => void;
    onSaveAndClose: () => void;
  }

  export function MarkdownEditor({ value, onSave, onSaveAndClose }: MarkdownEditorProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);

    function commit() {
      if (draft !== value) onSave(draft);
      setEditing(false);
    }

    if (editing) {
      return (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
            if (e.ctrlKey && e.key === "Enter") {
              if (draft !== value) onSave(draft);
              onSaveAndClose();
            }
          }}
          placeholder="Descrição em markdown..."
          className="min-h-[160px] w-full rounded-lg border border-accent-purple bg-bg-elevated p-3 text-sm text-text-primary outline-none"
        />
      );
    }

    return (
      <div
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="min-h-[80px] cursor-text rounded-lg border border-transparent p-3 text-sm text-text-primary hover:border-border hover:bg-bg-elevated"
      >
        {value.trim() ? (
          <div className="prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          </div>
        ) : (
          <span className="text-text-muted">Adicionar descrição...</span>
        )}
      </div>
    );
  }
  ```

  Note: no `@tailwindcss/typography` plugin is installed, so the `prose-*` classes above are inert (harmless, but not styling markdown output). This is fine for now — un-styled markdown (headings/lists/bold/etc. rendered with browser defaults) is acceptable for Fase 4; revisit only if it actually looks bad in manual testing.

- [x] **Step 2: Commit**
  ```bash
  git add src/components/card-detail/MarkdownEditor.tsx
  git commit -m "Add MarkdownEditor with edit/preview toggle"
  ```

---

### Task 6: `CardDetailPanel` component

**Files:** Create: `src/components/card-detail/CardDetailPanel.tsx`

**Interfaces:**
- Consumes: `Card` type, `useRenameCard`/`useUpdateCardDescription`/`useUpdateCardDueDate` (Task 3), `InlineEditableText`, `MarkdownEditor` (Task 5), `framer-motion`.
- Produces: `<CardDetailPanel card={Card} onClose={() => void} />`. Consumed by Task 8 (`BoardView`).

- [x] **Step 1:** Write `src/components/card-detail/CardDetailPanel.tsx`:
  ```tsx
  import { useEffect } from "react";
  import { motion } from "framer-motion";
  import type { Card as CardType } from "../../types";
  import { useRenameCard, useUpdateCardDescription, useUpdateCardDueDate } from "../../hooks/useCards";
  import { InlineEditableText } from "../ui/InlineEditableText";
  import { MarkdownEditor } from "./MarkdownEditor";

  interface CardDetailPanelProps {
    card: CardType;
    onClose: () => void;
  }

  export function CardDetailPanel({ card, onClose }: CardDetailPanelProps) {
    const renameCard = useRenameCard(card.list_id);
    const updateDescription = useUpdateCardDescription(card.list_id);
    const updateDueDate = useUpdateCardDueDate(card.list_id);

    useEffect(() => {
      function handleKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape") onClose();
      }
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 bg-black/50"
          onClick={onClose}
        />
        <motion.aside
          initial={{ x: 32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 32, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="relative flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-border bg-bg-surface p-6"
        >
          <div className="flex items-start justify-between gap-2">
            <InlineEditableText
              value={card.title}
              onSave={(title) => renameCard.mutate({ id: card.id, title })}
              className="text-xl font-semibold"
            />
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
              aria-label="Fechar painel"
            >
              ×
            </button>
          </div>

          <label className="flex flex-col gap-1 text-sm text-text-muted">
            Vencimento
            <input
              type="date"
              value={card.due_date ?? ""}
              onChange={(e) => updateDueDate.mutate({ id: card.id, dueDate: e.target.value || null })}
              className="w-fit rounded-lg border border-border bg-bg-elevated px-2 py-1 text-text-primary outline-none focus:border-accent-purple"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-sm text-text-muted">Descrição</span>
            <MarkdownEditor
              value={card.description}
              onSave={(description) => updateDescription.mutate({ id: card.id, description })}
              onSaveAndClose={onClose}
            />
          </div>
        </motion.aside>
      </div>
    );
  }
  ```
- [x] **Step 2: Commit**
  ```bash
  git add src/components/card-detail/CardDetailPanel.tsx
  git commit -m "Add CardDetailPanel with title, due date, and description"
  ```

---

### Task 7: Wire `onOpenDetail` through `Card` and `List`

**Files:** Modify: `src/components/board/Card.tsx`, `src/components/board/List.tsx`

**Interfaces:**
- Produces: `<Card card={CardType} onOpenDetail={(id: number) => void} />`, `<List list={ListType} cards={CardType[]} onOpenDetail={(id: number) => void} />`. Consumed by Task 8 (`BoardView`).

- [x] **Step 1:** In `Card.tsx`, add `onOpenDetail: (id: number) => void` to `CardProps`, and add `onClick={() => onOpenDetail(card.id)}` to the outer draggable `<div>` (alongside `{...attributes} {...listeners}`).
- [x] **Step 2:** In `List.tsx`, add `onOpenDetail: (id: number) => void` to `ListProps` and pass it through: `<Card key={card.id} card={card} onOpenDetail={onOpenDetail} />`.
- [x] **Step 3: Commit**
  ```bash
  git add src/components/board/Card.tsx src/components/board/List.tsx
  git commit -m "Thread onOpenDetail through List and Card"
  ```

---

### Task 8: Wire `CardDetailPanel` into `BoardView`

**Files:** Modify: `src/components/board/BoardView.tsx`

**Interfaces:**
- Consumes: `CardDetailPanel` (Task 6), `AnimatePresence` from `framer-motion`.
- Produces: the fully wired detail panel — leaf of the component tree.

- [x] **Step 1:** In `BoardView.tsx`:
  - Import `AnimatePresence` from `framer-motion` and `CardDetailPanel` from `../card-detail/CardDetailPanel`.
  - Add `const [selectedCardId, setSelectedCardId] = useState<number | null>(null);`
  - Derive `const selectedCard = computedBoard.flatMap((l) => l.cards).find((c) => c.id === selectedCardId) ?? null;`
  - Pass `onOpenDetail={setSelectedCardId}` down to each `<List>`.
  - After the `<DndContext>` closing tag (sibling, not inside it — the panel isn't part of the drag tree), render:
    ```tsx
    <AnimatePresence>
      {selectedCard && <CardDetailPanel card={selectedCard} onClose={() => setSelectedCardId(null)} />}
    </AnimatePresence>
    ```
- [x] **Step 2: Commit**
  ```bash
  git add src/components/board/BoardView.tsx
  git commit -m "Wire CardDetailPanel into BoardView"
  ```

---

### Task 9: Manual end-to-end verification

**Files:** none (checklist only).

- [x] **Step 1:** `npm install && npm run tauri dev`. Confirm the board loads with no regressions from Fase 3 (drag, rename, archive all still work).
- [x] **Step 2:** Click a card (not the title, not ×). Confirm the panel slides in from the right with a backdrop.
- [x] **Step 3:** Edit the title inline (double-click) inside the panel. Confirm it saves and the board's card title updates too (same card, same query key).
- [x] **Step 4:** Set a due date. Close and reopen the panel (and the app) — confirm it persisted.
- [x] **Step 5:** Click the description to edit, type some markdown (e.g. a list, bold text, a link), click away (blur) or press `Ctrl+Enter`. Confirm `Ctrl+Enter` both saves and closes the panel; confirm a plain blur saves without closing; confirm the preview renders the markdown (even unstyled).
- [x] **Step 6:** Close the panel three ways: `Esc`, clicking the backdrop, clicking ×. Confirm all three work and don't leave stale state (reopening the same or a different card shows fresh data).
- [x] **Step 7:** Click a card's title (single click, no double-click) and click the × archive button. Confirm neither accidentally opens or closes the panel unexpectedly, and archiving still removes the card from its list.
- [x] **Step 8:** Drag a card (a real drag, 8+px movement) and drop it. Confirm the panel does NOT open as a side effect of the drop.
- [x] **Step 9: Report back.** Tell me what you saw. If everything matches, Fase 4 is done.
