import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import type { Card as CardType, Label, List as ListType } from "../../types";
import { useCardCount, useCreateCard } from "../../hooks/useCards";
import { useDeleteList, useRenameList } from "../../hooks/useLists";
import { InlineEditableText } from "../ui/InlineEditableText";
import { Card } from "./Card";

interface ListProps {
  list: ListType;
  cards: CardType[];
  onOpenDetail: (id: number) => void;
  labelsByCard: Map<number, Label[]>;
  checklistProgressByCard: Map<number, { done: number; total: number }>;
  registerRef?: (id: number, node: HTMLDivElement | null) => void;
}

export function List({
  list,
  cards,
  onOpenDetail,
  labelsByCard,
  checklistProgressByCard,
  registerRef,
}: ListProps) {
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
    <div
      ref={(node) => {
        sortable.setNodeRef(node);
        registerRef?.(list.id, node);
      }}
      style={style}
      className="w-72 shrink-0"
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-surface p-4"
      >
        <div
          ref={sortable.setActivatorNodeRef}
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
              cards.map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  onOpenDetail={onOpenDetail}
                  labels={labelsByCard.get(card.id)}
                  checklistProgress={checklistProgressByCard.get(card.id)}
                />
              ))
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
