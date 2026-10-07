import { useEffect, useMemo, useState } from "react";
import type { DashboardData } from "../types";
import type { DemoAttachment } from "../lib/demoBoard";
import type { NotificationItem } from "../lib/notifications";
import type { NotificationsState } from "./useNotifications";
import { useDemoFiles } from "./useDemoFiles";

/**
 * Notificações fictícias da demonstração: ler e marcar mudam só a memória. Os módulos da
 * demonstração (tarefas, anexos, arquivos) só descem quando ela existe: este hook não os importa
 * de forma estática, para não entrarem no pacote principal.
 */
export function useDemoNotifications(demo: DashboardData | null): NotificationsState {
  const [built, setBuilt] = useState<{ demo: DashboardData; attachments: Map<string, DemoAttachment[]>; base: NotificationItem[] } | null>(null);
  useEffect(() => {
    if (!demo) {
      setBuilt(null);
      return;
    }
    let alive = true;
    void Promise.all([import("../lib/demoBoard"), import("../lib/demoNotifications")]).then(([board, notes]) => {
      if (!alive) return;
      const attachments = board.demoAttachments(demo);
      setBuilt({ demo, attachments, base: notes.demoNotifications(demo, attachments) });
    });
    return () => {
      alive = false;
    };
  }, [demo]);

  // Só vale se foi montada para esta demonstração (ao gerar outra, não mostra a anterior).
  const current = built && built.demo === demo ? built : null;
  const base = useMemo(() => current?.base ?? [], [current]);
  // Só os arquivos que aparecem nas notificações.
  const shown = useMemo(() => {
    const ids = new Set(base.flatMap((i) => i.thumbs.map((t) => t.id)));
    return [...(current?.attachments.values() ?? [])].flat().filter((a) => ids.has(a.id));
  }, [base, current]);
  const files = useDemoFiles(shown, demo);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setReadIds(new Set());
  }, [demo]);

  const items = base.map((i) => ({
    ...i,
    read: i.read || readIds.has(i.id),
    thumbs: i.thumbs.map((t) => ({ ...t, url: files.get(t.id)?.url ?? null })),
  }));
  return {
    items,
    unread: items.filter((i) => !i.read).length,
    isError: false,
    markRead: (item) => setReadIds((s) => new Set(s).add(item.id)),
    markAllRead: () => setReadIds(new Set(items.map((i) => i.id))),
  };
}
