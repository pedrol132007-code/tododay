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
