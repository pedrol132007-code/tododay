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
