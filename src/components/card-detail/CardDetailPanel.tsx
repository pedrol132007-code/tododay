import { useEffect } from "react";
import { motion } from "framer-motion";
import type { Card as CardType } from "../../types";
import { useRenameCard, useUpdateCardAssignee, useUpdateCardDescription, useUpdateCardDueDate } from "../../hooks/useCards";
import { useTeamMembers } from "../../hooks/useTeams";
import { useCardActivity } from "../../hooks/useActivity";
import { ActivityList } from "../ui/ActivityList";
import { useCanEdit, useCurrentTeamId } from "../../hooks/useCurrentTeam";
import { InlineEditableText } from "../ui/InlineEditableText";
import { Checklist } from "./Checklist";
import { LabelPicker } from "./LabelPicker";
import { MarkdownEditor } from "./MarkdownEditor";

interface CardDetailPanelProps {
  card: CardType;
  boardId: number;
  onClose: () => void;
}

export function CardDetailPanel({ card, boardId, onClose }: CardDetailPanelProps) {
  const renameCard = useRenameCard(card.list_id);
  const updateDescription = useUpdateCardDescription(card.list_id);
  const updateDueDate = useUpdateCardDueDate(card.list_id);
  const updateAssignee = useUpdateCardAssignee(card.list_id);
  const canEdit = useCanEdit();
  const { data: members } = useTeamMembers(useCurrentTeamId());
  const assignee = members?.find((m) => m.user_id === card.assignee_id);
  const { data: activities } = useCardActivity(card.id);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <motion.aside
        initial={{ x: 32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 32, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="relative flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-border bg-bg-surface p-6"
      >
        <div className="flex items-start justify-between gap-2">
          <InlineEditableText
            value={card.title}
            onSave={(title) => renameCard.mutate({ id: card.id, title })}
            className="text-xl font-semibold"
            readOnly={!canEdit}
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            aria-label="Fechar painel"
          >
            ×
          </button>
        </div>

        <label className="flex flex-col gap-1 text-sm text-text-muted">
          Responsável
          {canEdit ? (
            <select
              value={card.assignee_id ?? ""}
              onChange={(e) => updateAssignee.mutate({ id: card.id, assigneeId: e.target.value || null })}
              className="w-fit rounded-lg border border-border bg-bg-elevated px-2 py-1 text-text-primary outline-none focus:border-primary"
            >
              <option value="">Ninguém</option>
              {(members ?? []).map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.profile.display_name}
                  {member.job_title ? ` — ${member.job_title}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-text-primary">{assignee?.profile.display_name ?? "Ninguém"}</span>
          )}
        </label>

        <label className="flex flex-col gap-1 text-sm text-text-muted">
          Vencimento
          <input
            type="date"
            value={card.due_date ?? ""}
            disabled={!canEdit}
            onChange={(e) => updateDueDate.mutate({ id: card.id, dueDate: e.target.value || null })}
            className="w-fit rounded-lg border border-border bg-bg-elevated px-2 py-1 text-text-primary outline-none focus:border-primary"
          />
        </label>

        <LabelPicker boardId={boardId} cardId={card.id} />

        <div className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">Descrição</span>
          <MarkdownEditor
            value={card.description}
            onSave={(description) => updateDescription.mutate({ id: card.id, description })}
            onSaveAndClose={onClose}
            readOnly={!canEdit}
          />
        </div>

        <Checklist cardId={card.id} />

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className="text-sm text-text-muted">Histórico</span>
          <ActivityList activities={activities} where="card" />
        </div>
      </motion.aside>
    </div>
  );
}
