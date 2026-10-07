// Notificações na tela: o mesmo modelo para as do banco (0017_notifications.sql) e as da
// demonstração (demoNotifications.ts). Só funções puras; a frase sai do payload guardado na época.
import type { AppNotification, NotificationKind, NotificationPayload } from "../types";
import { daysBetween } from "./metrics";

export interface NotificationActor {
  id: string;
  name: string;
  avatarUrl: string | null;
  isLeader: boolean;
}

export interface NotificationThumb {
  id: string;
  name: string;
  /** URL assinada (banco) ou blob: (demonstração); null enquanto carrega. */
  url: string | null;
  isImage: boolean;
}

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  read: boolean;
  /** Última mudança (uma notificação agrupada sobe ao receber mais mudanças). */
  at: string;
  /** null = aviso do sistema (prazo). */
  actor: NotificationActor | null;
  /** Quem fez era líder na época. */
  fromLeader: boolean;
  sentence: string;
  cardTitle: string;
  boardName: string;
  excerpt: string;
  thumbs: NotificationThumb[];
  extraThumbs: number;
  /** null = sem link (card apagado, arquivado ou da demonstração). */
  boardId: number | null;
  cardId: number | null;
}

export type NotificationFilter = "all" | "unread" | "leader";

export const MAX_THUMBS = 4;
const EXCERPT_LENGTH = 160;

export function joinPt(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

export function notificationSentence(kind: NotificationKind, p: NotificationPayload, today: string): string {
  switch (kind) {
    case "assigned":
      return p.actor_name ? `${p.actor_name} atribuiu a você` : "Atribuído a você";
    case "due_3d":
      return `Vence em ${p.days_left ?? 3} dias`;
    case "due_1d":
      return "Vence amanhã";
    case "overdue": {
      // O que valia no aviso (days_left); só avisos antigos, sem isso, contam a partir do prazo.
      const late = p.days_left != null ? -p.days_left : p.due_date ? daysBetween(p.due_date, today) : 1;
      return late <= 1 ? "Atrasou: venceu ontem" : `Atrasada há ${late} dias`;
    }
    case "changed": {
      const n = p.attachments ?? 0;
      const changeOrder: Record<string, number> = { due_date: 0, description: 1, list: 2, attachments: 3 };
      const sorted = [...(p.changes ?? [])].sort((a, b) => (changeOrder[a] ?? 999) - (changeOrder[b] ?? 999));
      const parts = sorted.map((c) =>
        c === "due_date"
          ? "mudou o prazo"
          : c === "description"
            ? "editou a descrição"
            : c === "list"
              ? `moveu para ${p.list_name ?? "outra coluna"}`
              : c === "attachments"
                ? n === 1
                  ? "anexou 1 arquivo"
                  : `anexou ${n} arquivos`
                : "",
      );
      return `${p.actor_name ?? "Alguém"} ${joinPt(parts.filter((part) => part))}`;
    }
  }
}

export function splitThumbs(all: NotificationThumb[]): { thumbs: NotificationThumb[]; extra: number } {
  return { thumbs: all.slice(0, MAX_THUMBS), extra: Math.max(0, all.length - MAX_THUMBS) };
}

/** Descrição em uma linha, sem os marcadores de markdown mais comuns. */
export function excerptOf(description: string | null | undefined): string {
  const text = (description ?? "")
    .replace(/^\s*(?:[-*+>]|#{1,6})\s+/gm, "")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH - 1)}…` : text;
}

export function filterNotifications(items: NotificationItem[], filter: NotificationFilter): NotificationItem[] {
  if (filter === "unread") return items.filter((i) => !i.read);
  if (filter === "leader") return items.filter((i) => i.fromLeader);
  return items;
}

/** Texto do contador do sino; null = sem contador. */
export function bellLabel(unread: number): string | null {
  if (unread <= 0) return null;
  return unread > 9 ? "9+" : String(unread);
}

/**
 * Linha do banco → item da tela. `actor` é a pessoa hoje na equipe (nome e foto atuais); se ela
 * saiu, fica o nome da época, sem foto.
 */
export function toNotificationItem(
  row: AppNotification & { card: { description: string; archived_at: string | null } | null },
  actor: { name: string; avatarUrl: string | null } | null,
  thumbs: NotificationThumb[],
  today: string,
): NotificationItem {
  const p = row.payload;
  const split = splitThumbs(thumbs);
  // Conta apagada: o id sumiu, mas o nome e o destaque de líder da época ficam no payload.
  const leftTeam = row.actor_id === null && p.actor_name !== null && (row.kind === "assigned" || row.kind === "changed");
  const linkable = row.card_id !== null && row.card !== null && row.card.archived_at === null;
  return {
    id: String(row.id),
    kind: row.kind,
    read: row.read_at !== null,
    at: row.updated_at,
    actor: row.actor_id
      ? {
          id: row.actor_id,
          name: actor?.name ?? p.actor_name ?? "?",
          avatarUrl: actor?.avatarUrl ?? null,
          isLeader: p.actor_was_leader,
        }
      : leftTeam
        ? { id: `name:${p.actor_name}`, name: p.actor_name!, avatarUrl: null, isLeader: p.actor_was_leader }
        : null,
    fromLeader: (row.actor_id !== null || leftTeam) && p.actor_was_leader,
    sentence: notificationSentence(row.kind, p, today),
    cardTitle: p.card_title,
    boardName: p.board_name,
    excerpt: excerptOf(row.card?.description),
    thumbs: split.thumbs,
    extraThumbs: split.extra,
    boardId: linkable ? row.board_id : null,
    cardId: linkable ? row.card_id : null,
  };
}
