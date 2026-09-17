import { useState } from "react";
import { motion } from "framer-motion";
import type { List as ListType } from "../../types";
import { useCardCount, useCards, useCreateCard } from "../../hooks/useCards";
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
  const { data: cardCount } = useCardCount(list.id);
  const createCard = useCreateCard(list.id);
  const renameList = useRenameList(boardId);
  const deleteList = useDeleteList(boardId);
  const moveList = useMoveList(boardId);
  const [newCardTitle, setNewCardTitle] = useState("");

  const cardList = cards ?? [];
  const canDelete = cardCount !== undefined && cardCount === 0;

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
