import { useEffect, useRef, useState } from "react";
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
import { IconPlus } from "../ui/icons";
import { ListMenu } from "./ListMenu";
import { LIST_STATUS_LABEL } from "../../lib/boardVisuals";
import { ListCounter } from "./ListCounter";

interface ListProps {
  list: ListType;
  /** Os cards que aparecem (com filtro, só os que passam). */
  cards: CardType[];
  /** Cards da coluna inteira, para o contador e o WIP; sem filtro, igual a cards.length. */
  total?: number;
  /** Há filtro ligado: a coluna vazia diz que é por causa dele. */
  filtered?: boolean;
  onOpenDetail: (id: number) => void;
  labelsByCard: Map<number, Label[]>;
  checklistProgressByCard: Map<number, { done: number; total: number }>;
  registerRef?: (id: number, node: HTMLDivElement | null) => void;
}

export function List({
  list,
  cards,
  total = cards.length,
  filtered = false,
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

  // Card novo entra no fim: rola a coluna até ele, como no Trello.
  const cardsRef = useRef<HTMLDivElement | null>(null);
  const justAdded = useRef(false);
  useEffect(() => {
    if (!justAdded.current || !cardsRef.current) return;
    justAdded.current = false;
    cardsRef.current.scrollTop = cardsRef.current.scrollHeight;
  }, [cards.length]);

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
    justAdded.current = true;
  }

  return (
    <div
      ref={(node) => {
        sortable.setNodeRef(node);
        registerRef?.(list.id, node);
      }}
      style={style}
      className="flex max-h-full w-72 shrink-0 flex-col"
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={`flex min-h-0 flex-col rounded-2xl border bg-bg-column ${compact ? "gap-2 p-3" : "gap-3 p-4"} ${
          sortable.isDragging ? "border-dashed border-primary bg-primary/5 [&>*]:invisible" : "border-border"
        }`}
      >
        <div
          ref={sortable.setActivatorNodeRef}
          {...sortable.attributes}
          {...sortable.listeners}
          className={`flex shrink-0 items-center justify-between gap-2 ${canEdit ? "cursor-grab touch-none active:cursor-grabbing" : ""}`}
        >
          <div className="flex min-w-0 flex-col">
            <InlineEditableText
              value={list.name}
              onSave={(name) => renameList.mutate({ id: list.id, name })}
              className="text-lg font-semibold"
              readOnly={!canEdit}
            />
            <span className="px-2 text-[11px] uppercase tracking-wider text-text-muted">{LIST_STATUS_LABEL[list.status]}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ListCounter count={total} wipLimit={list.wip_limit} />
            {canEdit && <ListMenu list={list} canDelete={canDelete} onDelete={() => deleteList.mutate(list.id)} />}
          </div>
        </div>

        {/* Título e "Novo card..." ficam fixos; só os cards rolam quando a coluna passa da altura da tela. */}
        <div
          ref={(node) => {
            droppable.setNodeRef(node);
            cardsRef.current = node;
          }}
          className={`-mx-1 flex min-h-0 flex-col overflow-y-auto px-1 ${compact ? "gap-1.5" : "gap-2"}`}
        >
          <SortableContext items={cards.map((c) => `card-${c.id}`)} strategy={verticalListSortingStrategy}>
            {cards.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-3 text-center text-sm text-text-muted">
                {filtered && total > 0 ? "Nenhuma tarefa com esses filtros" : "Nenhuma tarefa aqui"}
              </div>
            ) : (
              cards.map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  listStatus={list.status}
                  onOpenDetail={onOpenDetail}
                  labels={labelsByCard.get(card.id)}
                  checklistProgress={checklistProgressByCard.get(card.id)}
                />
              ))
            )}
          </SortableContext>
        </div>

        {canEdit && (
          <div className="flex shrink-0 gap-2">
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
