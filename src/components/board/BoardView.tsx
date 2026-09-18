import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
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
    // Each branch below is responsible for clearing dragPreview exactly once: either
    // synchronously (no real move happened, so there's nothing to wait for) or after its
    // mutation(s) settle (so renderedBoard never falls back to the stale computedBoard while
    // the SQLite write + query invalidation are still in flight). clearingAsync tracks which
    // case we're in so the fallback at the bottom only fires for the synchronous case.
    let clearingAsync = false;

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

          // Populate dragPreview with the already-known final order immediately: unlike
          // cards, list drags never update dragPreview during onDragOver (the live visual
          // reorder comes from dnd-kit's own useSortable transform), so without this the
          // board would fall back to the stale pre-drag computedBoard the instant the drag
          // ends, then flash forward again once the query invalidates.
          setDragPreview(reordered);
          const pending: Promise<unknown>[] = [];
          if (rebalanced) pending.push(updateListPositions.mutateAsync(rebalanced));
          pending.push(updateListPosition.mutateAsync({ id: movedList.id, position }));
          void Promise.allSettled(pending).then(() => setDragPreview(null));
          clearingAsync = true;
        }
      }
    }

    if (activeData?.type === "card" && dragPreview && dragSourceListId !== null) {
      const activeId = String(active.id);
      const finalPreview = dragPreview;

      const targetListIndex = finalPreview.findIndex((l) => l.cards.some((c) => `card-${c.id}` === activeId));
      if (targetListIndex !== -1) {
        const targetList = finalPreview[targetListIndex];
        const targetIndex = targetList.cards.findIndex((c) => `card-${c.id}` === activeId);
        const movedCard = targetList.cards[targetIndex];
        const siblings = targetList.cards
          .filter((c) => c.id !== movedCard.id)
          .map((c) => ({ id: c.id, position: c.position }));
        const { position, rebalanced } = resolveInsertPosition(siblings, targetIndex);

        const pending: Promise<unknown>[] = [];
        if (rebalanced) pending.push(updateCardPositions.mutateAsync(rebalanced));
        if (targetList.id !== dragSourceListId) {
          pending.push(moveCardToList.mutateAsync({ id: movedCard.id, listId: targetList.id, position }));
        } else {
          pending.push(updateCardPosition.mutateAsync({ id: movedCard.id, position }));
        }
        // dragPreview already holds the correct final order (built incrementally by
        // handleDragOver) — keep showing it until the write settles instead of clearing it
        // immediately, which would otherwise briefly fall back to the stale computedBoard.
        void Promise.allSettled(pending).then(() => setDragPreview(null));
        clearingAsync = true;
      }
    }

    // Nothing was committed for this drop (no-op drag, dropped outside a droppable, or an
    // unrecognized active type) — there's nothing to wait for, so clear immediately rather
    // than leaving a stale preview stuck on screen.
    if (!clearingAsync) setDragPreview(null);
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
        collisionDetection={(args) => (args.pointerCoordinates ? pointerWithin(args) : closestCenter(args))}
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
