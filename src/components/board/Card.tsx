import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import type { Card as CardType, Label, ListStatus } from "../../types";
import { cardRisk, localDay } from "../../lib/dashboardRules";
import { useArchiveCard, useRenameCard, useRestoreCard } from "../../hooks/useCards";
import { useCanEdit, useCurrentTeamId } from "../../hooks/useCurrentTeam";
import { useCompact } from "../../hooks/usePreferences";
import { useTeamMembers } from "../../hooks/useTeams";
import { InlineEditableText } from "../ui/InlineEditableText";
import { IconArchive } from "../ui/icons";
import { useToast } from "../ui/Toast";
import { CardFace } from "./CardFace";

interface CardProps {
  card: CardType;
  listStatus: ListStatus;
  onOpenDetail: (id: number) => void;
  labels?: Label[];
  checklistProgress?: { done: number; total: number };
  attachments?: number;
  cover?: string;
}

export function Card({ card, listStatus, onOpenDetail, labels, checklistProgress, attachments = 0, cover }: CardProps) {
  const renameCard = useRenameCard(card.list_id);
  const archiveCard = useArchiveCard(card.list_id);
  // Precisa existir antes do arquivamento: o card some da tela, mas o "Desfazer" do aviso ainda
  // chama esta mutation (as invalidações dela rodam mesmo com o componente desmontado).
  const restoreCard = useRestoreCard(card.board_id);
  const toast = useToast();
  const canEdit = useCanEdit();
  const compact = useCompact();
  const { data: members } = useTeamMembers(useCurrentTeamId());
  const assignee = card.assignee_id ? members?.find((m) => m.user_id === card.assignee_id) : undefined;
  const risk = cardRisk({ dueDay: card.due_date, listStatus, enteredDay: localDay(new Date(card.list_entered_at)) }, localDay(new Date()));
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
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <CardFace
          title={
            <InlineEditableText
              value={card.title}
              onSave={(title) => renameCard.mutate({ id: card.id, title })}
              className="flex-1"
              readOnly={!canEdit}
            />
          }
          actions={
            canEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  archiveCard.mutate(card.id, {
                    onSuccess: () =>
                      toast({
                        // Arquivar guarda os anexos; só a exclusão definitiva apaga.
                        message: `“${card.title}” arquivado${
                          attachments > 0 ? ` · ${attachments === 1 ? "o anexo continua guardado" : `os ${attachments} anexos continuam guardados`}` : ""
                        }`,
                        action: { label: "Desfazer", onClick: () => restoreCard.mutate(card.id) },
                      }),
                  });
                }}
                className="mt-0.5 rounded-lg p-1 text-text-muted opacity-0 transition-opacity hover:bg-danger hover:text-on-accent focus-visible:opacity-100 group-hover:opacity-100"
                aria-label="Arquivar card"
              >
                <IconArchive size={14} />
              </button>
            )
          }
          priority={card.priority}
          due={card.due_date}
          done={listStatus === "done"}
          stalledDays={risk.stalledDays}
          assignee={assignee && { id: assignee.user_id, name: assignee.profile.display_name }}
          labels={labels}
          checklist={checklistProgress}
          attachments={attachments}
          cover={cover}
          compact={compact}
          dragging={isDragging}
        />
      </motion.div>
    </div>
  );
}
