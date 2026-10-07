import { must, supabase } from "./supabase";
import type { AppNotification, CardAttachment } from "../types";

// Notificações da pessoa logada (a RLS só devolve as dela). Só lê e marca como lida: quem cria é o
// banco (0017_notifications.sql).

export type NotificationRow = AppNotification & { card: { description: string; archived_at: string | null } | null };

/** As 100 mais recentes da equipe (o contador do sino sai daqui). */
export async function listNotifications(teamId: number): Promise<NotificationRow[]> {
  return must(
    await supabase
      .from("notification")
      .select("*, card(description, archived_at)")
      .eq("team_id", teamId)
      .order("updated_at", { ascending: false })
      .limit(100)
      .returns<NotificationRow[]>(),
  );
}

export async function markNotificationRead(id: number): Promise<void> {
  must(await supabase.from("notification").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null));
}

export async function markAllNotificationsRead(teamId: number): Promise<void> {
  must(await supabase.from("notification").update({ read_at: new Date().toISOString() }).eq("team_id", teamId).is("read_at", null));
}

export type NotificationAttachment = Pick<CardAttachment, "id" | "card_id" | "name" | "mime_type" | "storage_path">;

/** Anexos atuais dos cards das notificações, para as miniaturas. */
export async function listNotificationAttachments(cardIds: number[]): Promise<NotificationAttachment[]> {
  if (cardIds.length === 0) return [];
  return must(
    await supabase
      .from("card_attachment")
      .select("id, card_id, name, mime_type, storage_path")
      .in("card_id", cardIds)
      .order("created_at"),
  );
}
