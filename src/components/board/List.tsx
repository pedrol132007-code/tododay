import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import type { Card as CardType, Label, List as ListType } from "../../types";
import { useCardCount, useCreateCard } from "../../hooks/useCards";
import { useDeleteList, useRenameList } from "../../hooks/useLists";
import { useCanEdit } from "../../hooks/useCurrentTeam";
import { useCompact } from "../../hooks/usePreferences";
import { InlineEditableText } from "../ui/InlineEditableText";
import { Card } from "./Card";
import { IconPlus, IconTrash } from "../ui/icons";

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
  const canEdit = useCanEdit();
  const compact = useCompact();

  const canDelete = cardCount !== undefined && cardCount === 0;

  const sortable = useSortable({ id: `list-${list.id}`, data: { type: "list" } });
  const droppable = useDroppable({
    id: `cards-of-list-${list.id}`,
    data: { type: "list-container", listId: list.id },
  });

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
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
        className={`flex flex-col rounded-2xl border bg-bg-column ${compact ? "gap-2 p-3" : "gap-3 p-4"} ${
          sortable.isDragging ? "border-dashed border-primary bg-primary/5 [&>*]:invisible" : "border-border"
        }`}
      >
        <div
          ref={sortable.setActivatorNodeRef}
          {...sortable.attributes}
          {...sortable.listeners}
          className={`flex items-center justify-between gap-2 ${canEdit ? "cursor-grab touch-none active:cursor-grabbing" : ""}`}
        >
          <InlineEditableText
            value={list.name}
            onSave={(name) => renameList.mutate({ id: list.id, name })}
            className="text-lg font-semibold"
            readOnly={!canEdit}
          />
          {canEdit && (
            <button
              type="button"
              disabled={!canDelete}
              onClick={() => deleteList.mutate(list.id)}
              title={canDelete ? "Excluir coluna" : "Mova ou arquive os cards antes de excluir"}
              className="rounded-lg p-1 text-text-muted hover:bg-danger hover:text-on-accent disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-muted"
              aria-label="Excluir coluna"
            >
              <IconTrash size={14} />
            </button>
          )}
        </div>

        <div ref={droppable.setNodeRef} className={`flex flex-col ${compact ? "gap-1.5" : "gap-2"}`}>
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

        {canEdit && (
          <div className="flex gap-2">
            <input
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCard()}
              placeholder="Novo card..."
              className="flex-1 rounded-lg border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={handleAddCard}
              className="btn-primary px-2.5 py-1.5"
              aria-label="Adicionar card"
            >
              <IconPlus size={16} />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
