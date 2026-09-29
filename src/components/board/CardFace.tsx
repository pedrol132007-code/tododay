import type { ReactNode } from "react";
import type { CardPriority } from "../../types";
import { PRIORITY_LABEL } from "../../lib/boardVisuals";
import { readableTextOn } from "../../lib/contrast";
import { Avatar } from "../ui/Avatar";
import { DueBadge } from "../ui/DueBadge";
import { IconPaperclip } from "../ui/icons";

/** Faixa na borda esquerda: só cor de token, e o nome da prioridade vai no title e para leitor de tela. */
const PRIORITY_STRIPE: Record<CardPriority, string> = {
  urgent: "bg-danger",
  high: "bg-highlight",
  medium: "bg-primary",
  low: "bg-border",
};

/** Quantas etiquetas aparecem com nome; o resto vira "+N". */
const MAX_LABELS = 2;

export interface CardFaceProps {
  /** O título (texto, ou o campo editável do board real). */
  title: ReactNode;
  /** Ações que aparecem no hover (ex.: arquivar). */
  actions?: ReactNode;
  priority: CardPriority | null;
  due: string | null;
  /** Coluna "Concluído": prazo e parada não alertam. */
  done: boolean;
  stalledDays: number | null;
  assignee?: { id: string; name: string };
  labels?: { id: number | string; name: string; color: string }[];
  checklist?: { done: number; total: number };
  /** Quantos anexos o card tem (0 ou ausente: não mostra nada). */
  attachments?: number;
  /** URL da imagem de capa. No modo compacto a capa não aparece, só o clipe. */
  cover?: string;
  compact: boolean;
  dragging?: boolean;
}

/** O visual do card, sem arrastar nem editar: usado pelo board real e pelo de demonstração. */
export function CardFace({ title, actions, priority, due, done, stalledDays, assignee, labels = [], checklist, attachments = 0, cover, compact, dragging }: CardFaceProps) {
  const shownLabels = labels.slice(0, MAX_LABELS);
  const hiddenLabels = labels.length - shownLabels.length;
  const hasChecklist = checklist != null && checklist.total > 0;
  const hasMeta = due != null || hasChecklist || attachments > 0 || assignee != null || stalledDays != null;

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-bg-card transition-[border-color,box-shadow] duration-150 ${
        compact ? "gap-0.5 py-1 pl-2.5 pr-2 text-sm" : "gap-1 py-2 pl-3.5 pr-3"
      } ${
        // Enquanto arrasta, o card vira só o contorno do lugar onde vai cair.
        dragging ? "border-dashed border-primary bg-primary/5 shadow-none [&>*]:invisible" : "border-border shadow-card hover:border-primary/40 hover:shadow-md"
      }`}
    >
      {priority && (
        <span
          className={`absolute inset-y-0 left-0 w-1 ${PRIORITY_STRIPE[priority]}`}
          title={`Prioridade: ${PRIORITY_LABEL[priority]}`}
          aria-hidden="true"
        />
      )}
      {priority && <span className="sr-only">Prioridade {PRIORITY_LABEL[priority]}.</span>}

      {cover && !compact && (
        // Faixa baixa no topo, recortada, sangrando até a borda do card (desfaz o padding dele).
        <img src={cover} alt="" loading="lazy" className="-mt-2 -ml-3.5 -mr-3 mb-1 h-20 w-[calc(100%+1.625rem)] max-w-none object-cover" />
      )}

      {labels.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-1 px-2">
          {shownLabels.map((label) => (
            <span
              key={label.id}
              style={{ backgroundColor: label.color, color: readableTextOn(label.color) }}
              className="max-w-[8rem] truncate rounded-md px-1.5 text-[11px] font-medium leading-4"
            >
              {label.name}
            </span>
          ))}
          {hiddenLabels > 0 && (
            <span className="text-[11px] text-text-muted" title={labels.slice(MAX_LABELS).map((l) => l.name).join(", ")}>
              +{hiddenLabels}
            </span>
          )}
        </div>
      )}

      <div className="flex items-start justify-between gap-1">
        {title}
        {actions}
      </div>

      {hasMeta && (
        // Metadados numa linha própria, para o título usar a largura toda do card.
        // O responsável abre a linha, colado ao prazo: quem e até quando ficam juntos.
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2">
          {assignee && <Avatar userId={assignee.id} name={assignee.name} title={`Responsável: ${assignee.name}`} small />}
          {due && <DueBadge due={due} done={done} />}
          {stalledDays != null && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-text-muted" title="Sem mudar de coluna">
              <span className="h-1.5 w-1.5 rounded-full bg-highlight" aria-hidden="true" />
              Parada há {stalledDays} dias
            </span>
          )}
          {hasChecklist && (
            <span
              className={`whitespace-nowrap text-xs tabular-nums ${checklist.done === checklist.total ? "text-primary" : "text-text-muted"}`}
              title="Itens do checklist concluídos"
            >
              ✓ {checklist.done}/{checklist.total}
            </span>
          )}
          {attachments > 0 && (
            <span
              className="inline-flex items-center gap-0.5 whitespace-nowrap text-xs tabular-nums text-text-muted"
              title={`${attachments} ${attachments === 1 ? "anexo" : "anexos"}`}
            >
              <IconPaperclip size={12} />
              {attachments}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
