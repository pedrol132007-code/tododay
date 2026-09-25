import { useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { Card as CardType } from "../../types";
import { useRenameCard, useUpdateCardAssignee, useUpdateCardDescription, useUpdateCardDueDate } from "../../hooks/useCards";
import { useTeamMembers } from "../../hooks/useTeams";
import { useCardActivity } from "../../hooks/useActivity";
import { ActivityList } from "../ui/ActivityList";
import { useCanEdit, useCurrentTeamId } from "../../hooks/useCurrentTeam";
import { InlineEditableText } from "../ui/InlineEditableText";
import { Avatar } from "../ui/Avatar";
import { DueBadge } from "../ui/DueBadge";
import { Checklist } from "./Checklist";
import { LabelPicker } from "./LabelPicker";
import { MarkdownEditor } from "./MarkdownEditor";
import { PanelSection } from "./PanelSection";
import { IconCalendar, IconUsers, IconX } from "../ui/icons";

interface CardDetailPanelProps {
  card: CardType;
  boardId: number;
  onClose: () => void;
}

const fieldClass =
  "w-fit rounded-lg border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary outline-none focus:border-primary";

function DetailRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <>
      <span className="inline-flex items-center gap-2 text-sm text-text-muted">
        {icon}
        {label}
      </span>
      <div className="flex min-h-8 flex-wrap items-center gap-2">{children}</div>
    </>
  );
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
        className="relative flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto border-l border-border bg-bg-surface px-6 pb-6"
      >
        <div className="-mx-6 h-1 shrink-0 bg-brand-gradient" />
        <div className="flex items-start justify-between gap-2">
          <InlineEditableText
            value={card.title}
            onSave={(title) => renameCard.mutate({ id: card.id, title })}
            className="text-2xl font-normal leading-tight tracking-tight"
            readOnly={!canEdit}
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            aria-label="Fechar painel"
          >
            <IconX size={18} />
          </button>
        </div>

        <PanelSection title="Detalhes">
          <div className="grid grid-cols-[8rem_1fr] items-center gap-x-3 gap-y-3">
            <DetailRow icon={<IconUsers size={16} />} label="Responsável">
              {assignee && <Avatar userId={assignee.user_id} name={assignee.profile.display_name} />}
              {canEdit ? (
                <select
                  aria-label="Responsável"
                  value={card.assignee_id ?? ""}
                  onChange={(e) => updateAssignee.mutate({ id: card.id, assigneeId: e.target.value || null })}
                  className={fieldClass}
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
                <span className="text-sm text-text-primary">{assignee?.profile.display_name ?? "Ninguém"}</span>
              )}
            </DetailRow>

            <DetailRow icon={<IconCalendar size={16} />} label="Vencimento">
              <input
                type="date"
                aria-label="Vencimento"
                value={card.due_date ?? ""}
                disabled={!canEdit}
                onChange={(e) => updateDueDate.mutate({ id: card.id, dueDate: e.target.value || null })}
                className={fieldClass}
              />
              {card.due_date && <DueBadge due={card.due_date} withLabel />}
            </DetailRow>
          </div>
        </PanelSection>

        <LabelPicker boardId={boardId} cardId={card.id} />

        <PanelSection title="Descrição">
          <MarkdownEditor
            value={card.description}
            onSave={(description) => updateDescription.mutate({ id: card.id, description })}
            onSaveAndClose={onClose}
            readOnly={!canEdit}
          />
        </PanelSection>

        <Checklist cardId={card.id} />

        <PanelSection title="Histórico">
          <ActivityList activities={activities} where="card" />
        </PanelSection>
      </motion.aside>
    </div>
  );
}
