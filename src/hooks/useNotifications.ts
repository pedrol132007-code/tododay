import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listNotificationAttachments,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../db/notifications";
import { localDay } from "../lib/dashboardRules";
import { toNotificationItem, type NotificationItem, type NotificationThumb } from "../lib/notifications";
import { useAttachmentUrls } from "./useAttachments";
import { useTeamMembers } from "./useTeams";

/** O que o sino e a aba precisam, venha do banco ou da demonstração. */
export interface NotificationsState {
  items: NotificationItem[];
  unread: number;
  isError: boolean;
  markRead: (item: NotificationItem) => void;
  markAllRead: () => void;
}

export function useTeamNotifications(teamId: number): NotificationsState {
  const queryClient = useQueryClient();
  const { data: rows, isError } = useQuery({ queryKey: ["notifications", teamId], queryFn: () => listNotifications(teamId) });
  const { data: members } = useTeamMembers(teamId);

  // Miniaturas só das 20 primeiras: é o que está à vista.
  const cardIds = useMemo(
    () => [...new Set((rows ?? []).slice(0, 20).flatMap((r) => (r.card_id !== null && r.card ? [r.card_id] : [])))],
    [rows],
  );
  const { data: attachments } = useQuery({
    queryKey: ["notificationAttachments", cardIds],
    queryFn: () => listNotificationAttachments(cardIds),
    enabled: cardIds.length > 0,
  });
  const images = useMemo(() => (attachments ?? []).filter((a) => a.mime_type.startsWith("image/")), [attachments]);
  const { data: urls } = useAttachmentUrls(images);

  const items = useMemo(() => {
    const today = localDay(new Date());
    return (rows ?? []).map((row) => {
      const member = row.actor_id ? members?.find((m) => m.user_id === row.actor_id) : undefined;
      const thumbs: NotificationThumb[] = (attachments ?? [])
        .filter((a) => a.card_id === row.card_id)
        .map((a) => ({
          id: String(a.id),
          name: a.name,
          url: a.mime_type.startsWith("image/") ? urls?.get(a.storage_path) ?? null : null,
          isImage: a.mime_type.startsWith("image/"),
        }));
      return toNotificationItem(
        row,
        member ? { name: member.profile.display_name, avatarUrl: member.profile.avatar_url } : null,
        thumbs,
        today,
      );
    });
  }, [rows, members, attachments, urls]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications", teamId] });
  const markOne = useMutation({ mutationFn: (id: number) => markNotificationRead(id), onSettled: invalidate });
  const markAll = useMutation({ mutationFn: () => markAllNotificationsRead(teamId), onSettled: invalidate });

  return {
    items,
    unread: items.filter((i) => !i.read).length,
    isError,
    markRead: (item) => {
      if (!item.read) markOne.mutate(Number(item.id));
    },
    markAllRead: () => markAll.mutate(),
  };
}
