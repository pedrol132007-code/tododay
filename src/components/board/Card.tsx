import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import type { Card as CardType, Label } from "../../types";
import { useArchiveCard, useRenameCard } from "../../hooks/useCards";
import { useCanEdit, useCurrentTeamId } from "../../hooks/useCurrentTeam";
import { useCompact } from "../../hooks/usePreferences";
import { useTeamMembers } from "../../hooks/useTeams";
import { Avatar } from "../ui/Avatar";
import { DueBadge } from "../ui/DueBadge";
import { InlineEditableText } from "../ui/InlineEditableText";
import { IconArchive } from "../ui/icons";

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
        className={`group flex flex-col rounded-xl border bg-bg-card transition-[border-color,box-shadow] duration-150 ${
          compact ? "gap-0.5 px-2 py-1 text-sm" : "gap-1 px-3 py-2"
        } ${
          // Enquanto arrasta, o card vira só o contorno do lugar onde vai cair (o card "de verdade"
          // segue o mouse no DragOverlay do BoardView).
          isDragging
            ? "border-dashed border-primary bg-primary/5 shadow-none [&>*]:invisible"
            : "border-border shadow-card hover:border-primary/40 hover:shadow-md"
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
        <div className="flex items-start justify-between gap-1">
          <InlineEditableText
            value={card.title}
            onSave={(title) => renameCard.mutate({ id: card.id, title })}
            className="flex-1"
            readOnly={!canEdit}
          />
          {canEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                archiveCard.mutate(card.id);
              }}
              className="mt-0.5 rounded-lg p-1 text-text-muted opacity-0 transition-opacity hover:bg-danger hover:text-on-accent focus-visible:opacity-100 group-hover:opacity-100"
              aria-label="Arquivar card"
            >
              <IconArchive size={14} />
            </button>
          )}
        </div>
        {(card.due_date || assignee || (checklistProgress && checklistProgress.total > 0)) && (
          // Metadados numa linha própria, para o título usar a largura toda do card.
          <div className="flex items-center gap-2 px-2">
            {card.due_date && <DueBadge due={card.due_date} />}
            {checklistProgress && checklistProgress.total > 0 && (
              <span
                className={`whitespace-nowrap text-xs tabular-nums ${
                  checklistProgress.done === checklistProgress.total ? "text-primary" : "text-text-muted"
                }`}
                title="Itens do checklist concluídos"
              >
                ✓ {checklistProgress.done}/{checklistProgress.total}
              </span>
            )}
            {assignee && (
              <span className="ml-auto">
                <Avatar
                  userId={assignee.user_id}
                  name={assignee.profile.display_name}
                  title={`Responsável: ${assignee.profile.display_name}`}
                />
              </span>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
