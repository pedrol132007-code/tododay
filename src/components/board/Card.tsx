import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import type { Card as CardType, Label, Member } from "../../types";
import { useArchiveCard, useRenameCard } from "../../hooks/useCards";
import { InlineEditableText } from "../ui/InlineEditableText";
import { StatusBadge } from "../ui/StatusBadge";
import { useSettings } from "../settings/SettingsProvider";

interface CardProps {
  card: CardType;
  onOpenDetail: (id: number) => void;
  labels?: Label[];
  checklistProgress?: { done: number; total: number };
  requestedBy?: Member;
}

export function Card({ card, onOpenDetail, labels, checklistProgress, requestedBy }: CardProps) {
  const renameCard = useRenameCard(card.list_id);
  const archiveCard = useArchiveCard(card.list_id);
  const { compact } = useSettings().settings;
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
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
      ref={(node) => {
        setNodeRef(node);
        setActivatorNodeRef(node);
      }}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpenDetail(card.id)}
      className="cursor-grab touch-none active:cursor-grabbing"
    >
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={`flex flex-col rounded-xl border border-border bg-bg-elevated ${
          compact ? "gap-0.5 px-2 py-1 text-sm" : "gap-1 px-3 py-2"
        }`}
      >
        {labels && labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {labels.map((label) => (
              <span
                key={label.id}
                title={label.name}
                style={{ backgroundColor: label.color }}
                className="h-1.5 w-6 rounded-full"
              />
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <InlineEditableText
            value={card.title}
            onSave={(title) => renameCard.mutate({ id: card.id, title })}
            className="flex-1"
          />
          <div className="flex items-center gap-1">
            {checklistProgress && checklistProgress.total > 0 && (
              <span className="whitespace-nowrap text-xs text-text-muted">
                {checklistProgress.done}/{checklistProgress.total}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                archiveCard.mutate(card.id);
              }}
              className="rounded-lg px-1 text-text-muted hover:bg-accent-pink hover:text-bg-base"
              aria-label="Arquivar card"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-2">
          <StatusBadge status={card.status} compact={compact} />
          {requestedBy && (
            <span className="flex min-w-0 items-center gap-1 text-xs text-text-muted" title={`Pedido por ${requestedBy.name}`}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: requestedBy.color }} />
              <span className="truncate">por {requestedBy.name}</span>
            </span>
          )}
        </div>
      </motion.div>
    </div>
  );
}
