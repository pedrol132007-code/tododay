import { useState } from "react";
import type { NotificationsState } from "../../hooks/useNotifications";
import { relativeTime } from "../../lib/activity";
import { filterNotifications, type NotificationFilter, type NotificationItem } from "../../lib/notifications";
import { Avatar } from "../ui/Avatar";
import { EmptyState } from "../ui/EmptyState";
import { IconBell, IconPaperclip } from "../ui/icons";
import { PageHeader } from "../ui/PageHeader";

const FILTERS: { id: NotificationFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "unread", label: "Não lidas" },
  { id: "leader", label: "Do líder" },
];

interface NotificationsViewProps {
  state: NotificationsState;
  /** Demonstração: notificações fictícias, aviso no topo. */
  isDemo: boolean;
  onBack: () => void;
  /** Clicou num item: marca como lida e abre o card (quem chama decide para onde ir). */
  onOpen: (item: NotificationItem) => void;
}

export function NotificationsView({ state, isDemo, onBack, onOpen }: NotificationsViewProps) {
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const visible = filterNotifications(state.items, filter);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
      <PageHeader title="Notificações" onBack={onBack} />
      <div className="flex max-w-2xl flex-col gap-4">
        {isDemo && (
          <p className="rounded-xl bg-bg-elevated px-3 py-2 text-sm text-text-muted">
            Demonstração: notificações fictícias, geradas a partir das tarefas de exemplo.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-xl bg-bg-elevated p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-lg px-3 py-1 text-sm ${
                  filter === f.id ? "bg-bg-surface font-semibold text-primary shadow-sm" : "text-text-muted hover:text-text-primary"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {state.unread > 0 && (
            <button type="button" onClick={state.markAllRead} className="ml-auto rounded-lg px-3 py-1 text-sm text-primary hover:bg-bg-elevated">
              Marcar todas como lidas
            </button>
          )}
        </div>

        {state.isError ? (
          <EmptyState icon={<IconBell size={22} />} title="Não foi possível carregar as notificações." description="Verifique sua internet e tente de novo." />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<IconBell size={22} />}
            title={filter === "all" ? "Nenhuma notificação." : "Nada aqui."}
            description="Quando alguém atribuir um card a você, um prazo chegar perto ou mudarem um card seu, aparece aqui."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((item) => (
              <li key={item.id}>
                <NotificationRow item={item} onOpen={() => onOpen(item)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NotificationRow({ item, onOpen }: { item: NotificationItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full gap-3 rounded-xl border px-3 py-3 text-left hover:border-highlight ${
        item.read ? "border-border bg-bg-card" : "border-border bg-bg-elevated"
      }`}
    >
      {item.actor ? (
        <Avatar userId={item.actor.id} name={item.actor.name} avatarUrl={item.actor.avatarUrl} leader={item.actor.isLeader} large />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-surface" title="Aviso do Tododay">
          <img src="/b-mark.svg" alt="" className="h-5 w-auto" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          {!item.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Não lida" />}
          <span className={`text-sm ${item.read ? "text-text-primary" : "font-semibold text-text-primary"}`}>{item.sentence}</span>
          {item.fromLeader && (
            <span className="rounded-full border border-highlight px-2 text-[11px] font-semibold text-highlight">Pedido do líder</span>
          )}
          <span className="ml-auto text-xs text-text-muted">{relativeTime(item.at)}</span>
        </span>
        <span className="truncate text-sm text-text-primary">
          {item.cardTitle} <span className="text-text-muted">· {item.boardName}</span>
        </span>
        {item.excerpt && <span className="line-clamp-2 text-xs text-text-muted">{item.excerpt}</span>}
        {(item.thumbs.length > 0 || item.extraThumbs > 0) && (
          <span className="flex flex-wrap items-center gap-2 pt-1">
            {item.thumbs.map((t) =>
              t.isImage && t.url ? (
                <img key={t.id} src={t.url} alt={t.name} className="h-12 w-16 rounded-lg border border-border object-cover" />
              ) : (
                <span key={t.id} className="flex h-12 max-w-[8rem] items-center gap-1 rounded-lg border border-border px-2 text-xs text-text-muted">
                  <IconPaperclip size={12} />
                  <span className="truncate">{t.name}</span>
                </span>
              ),
            )}
            {item.extraThumbs > 0 && <span className="text-xs text-text-muted">+{item.extraThumbs}</span>}
          </span>
        )}
      </span>
    </button>
  );
}
