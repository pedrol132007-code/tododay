import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { CardPriority, Card as CardType } from "../../types";
import { useRenameCard, useUpdateCardAssignee, useUpdateCardDescription, useUpdateCardDueDate, useUpdateCardPriority } from "../../hooks/useCards";
import { PRIORITIES, PRIORITY_LABEL } from "../../lib/boardVisuals";
import { useTeamMembers } from "../../hooks/useTeams";
import { useLists } from "../../hooks/useLists";
import { useCardActivity } from "../../hooks/useActivity";
import { useAttachments, useAttachmentUploads } from "../../hooks/useAttachments";
import { ActivityList } from "../ui/ActivityList";
import { MoveCard } from "./MoveCard";
import { useCanEdit, useCurrentTeamId } from "../../hooks/useCurrentTeam";
import { InlineEditableText } from "../ui/InlineEditableText";
import { Avatar } from "../ui/Avatar";
import { DueBadge } from "../ui/DueBadge";
import { Attachments } from "./Attachments";
import { Checklist } from "./Checklist";
import { LabelPicker } from "./LabelPicker";
import { MarkdownEditor } from "./MarkdownEditor";
import { PanelSection } from "./PanelSection";
import { IconCalendar, IconChevronDown, IconFlag, IconTag, IconUsers, IconX } from "../ui/icons";

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
      <span className="inline-flex min-h-8 items-center gap-2 text-sm text-text-muted">
        {icon}
        {label}
      </span>
      <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-2">{children}</div>
    </>
  );
}

export function CardDetailPanel({ card, boardId, onClose }: CardDetailPanelProps) {
  const renameCard = useRenameCard(card.list_id);
  const updateDescription = useUpdateCardDescription(card.list_id);
  const updateDueDate = useUpdateCardDueDate(card.list_id);
  const updateAssignee = useUpdateCardAssignee(card.list_id);
  const updatePriority = useUpdateCardPriority(card.list_id);
  const { data: lists } = useLists(boardId);
  const inDoneList = lists?.find((l) => l.id === card.list_id)?.status === "done";
  const canEdit = useCanEdit();
  const { data: members } = useTeamMembers(useCurrentTeamId());
  const assignee = members?.find((m) => m.user_id === card.assignee_id);
  const { data: activities } = useCardActivity(card.id);
  const { data: attachments } = useAttachments(card.id);
  const { uploads, send } = useAttachmentUploads(card.id, canEdit);
  // Arquivos arrastados para qualquer lugar do painel viram anexos.
  const [dragging, setDragging] = useState(false);
  // Histórico é consulta ocasional: começa recolhido.
  const [showHistory, setShowHistory] = useState(false);
  const hasFiles = (e: DragEvent) => canEdit && e.dataTransfer.types.includes("Files");

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
        role="dialog"
        aria-label={card.title}
        initial={{ x: 32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 32, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="relative flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto border-l border-border bg-bg-surface px-6 pb-6"
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragging(false);
          send([...e.dataTransfer.files]);
        }}
      >
        <div className="-mx-6 h-1 shrink-0 bg-brand-gradient" />
        <div className="flex items-start justify-between gap-2">
          <InlineEditableText
            value={card.title}
            onSave={(title) => renameCard.mutate({ id: card.id, title })}
            className="text-2xl font-normal leading-tight tracking-tight"
            readOnly={!canEdit}
          />
          <div className="flex shrink-0 items-center gap-1">
            {canEdit && <MoveCard card={card} />}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
              aria-label="Fechar painel"
            >
              <IconX size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3">
          <DetailRow icon={<IconUsers size={16} />} label="Responsável">
            {assignee && <Avatar userId={assignee.user_id} name={assignee.profile.display_name} avatarUrl={assignee.profile.avatar_url} leader={assignee.is_leader} />}
            {canEdit ? (
              <select
                aria-label="Responsável"
                value={card.assignee_id ?? ""}
                onChange={(e) => updateAssignee.mutate({ id: card.id, assigneeId: e.target.value || null })}
                className={fieldClass}
              >
                <option value="">Ninguém</option>
                {/* Quem está desativado não recebe cards novos, mas continua aparecendo nos que já são dele. */}
                {(members ?? [])
                  .filter((member) => !member.deactivated_at || member.user_id === card.assignee_id)
                  .map((member) => (
                    <option key={member.user_id} value={member.user_id} disabled={!!member.deactivated_at}>
                      {member.profile.display_name}
                      {member.deactivated_at ? " (desativado)" : member.job_title ? ` — ${member.job_title}` : ""}
                    </option>
                  ))}
              </select>
            ) : (
              <span className="text-sm text-text-primary">{assignee?.profile.display_name ?? "Ninguém"}</span>
            )}
          </DetailRow>

          <DetailRow icon={<IconFlag size={16} />} label="Prioridade">
            {canEdit ? (
              <select
                aria-label="Prioridade"
                value={card.priority ?? ""}
                onChange={(e) => updatePriority.mutate({ id: card.id, priority: (e.target.value || null) as CardPriority | null })}
                className={fieldClass}
              >
                <option value="">Sem prioridade</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-text-primary">{card.priority ? PRIORITY_LABEL[card.priority] : "Sem prioridade"}</span>
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
            {card.due_date && <DueBadge due={card.due_date} withLabel done={inDoneList} />}
          </DetailRow>

          <DetailRow icon={<IconTag size={16} />} label="Etiquetas">
            <LabelPicker boardId={boardId} cardId={card.id} />
          </DetailRow>
        </div>

        <PanelSection title="Descrição">
          <MarkdownEditor
            value={card.description}
            onSave={(description) => updateDescription.mutate({ id: card.id, description })}
            onSaveAndClose={onClose}
            readOnly={!canEdit}
          />
        </PanelSection>

        <Attachments cardId={card.id} attachments={attachments} uploads={uploads} onFiles={send} dragging={dragging} />

        <Checklist cardId={card.id} />

        <section className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            className="inline-flex w-fit items-center gap-1 text-xs font-semibold uppercase tracking-wider text-text-muted hover:text-text-primary"
          >
            Histórico
            {activities && activities.length > 0 && <span className="tabular-nums">({activities.length})</span>}
            <IconChevronDown size={14} className={`transition-transform ${showHistory ? "" : "-rotate-90"}`} />
          </button>
          {showHistory && <ActivityList activities={activities} where="card" />}
        </section>
      </motion.aside>
    </div>
  );
}
