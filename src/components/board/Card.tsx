import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import type { Card as CardType, Label } from "../../types";
import { useArchiveCard, useRenameCard } from "../../hooks/useCards";
import { useCanEdit, useCurrentTeamId } from "../../hooks/useCurrentTeam";
import { useCompact } from "../../hooks/usePreferences";
import { useTeamMembers } from "../../hooks/useTeams";
import { Avatar } from "../ui/Avatar";
import { InlineEditableText } from "../ui/InlineEditableText";

interface CardProps {
  card: CardType;
  onOpenDetail: (id: number) => void;
  labels?: Label[];
  checklistProgress?: { done: number; total: number };
}

export function Card({ card, onOpenDetail, labels, checklistProgress }: CardProps) {
  const renameCard = useRenameCard(card.list_id);
  const archiveCard = useArchiveCard(card.list_id);
  const canEdit = useCanEdit();
  const compact = useCompact();
  const { data: members } = useTeamMembers(useCurrentTeamId());
  const assignee = card.assignee_id ? members?.find((m) => m.user_id === card.assignee_id) : undefined;
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
      className={canEdit ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"}
    >
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={`flex flex-col rounded-xl border border-border bg-bg-card shadow-card ${compact ? "gap-0.5 px-2 py-1 text-sm" : "gap-1 px-3 py-2"}`}
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
            readOnly={!canEdit}
          />
          <div className="flex items-center gap-1">
            {assignee && (
              <Avatar name={assignee.profile.display_name} title={`Responsável: ${assignee.profile.display_name}`} />
            )}
            {checklistProgress && checklistProgress.total > 0 && (
              <span className="whitespace-nowrap text-xs text-text-muted">
                {checklistProgress.done}/{checklistProgress.total}
              </span>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  archiveCard.mutate(card.id);
                }}
                className="rounded-lg px-1 text-text-muted hover:bg-danger hover:text-on-accent"
                aria-label="Arquivar card"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
