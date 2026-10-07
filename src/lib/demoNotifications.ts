// Notificações da demonstração, tiradas das próprias tarefas fictícias. Quem recebe é a primeira
// pessoa não líder com mais tipos de aviso de prazo possíveis; quem atribui e muda é o líder. Avisos
// de prazo só aparecem se essa pessoa tem de fato uma tarefa aberta com prazo na janela (nunca se
// inventa data). Atribuição e mudança aparecem sempre (só precisam de uma tarefa aberta). Nada vai
// para o banco.
import type { DashboardData, DashboardPerson, DashboardTask, NotificationKind, NotificationPayload } from "../types";
import { DEMO_BOARD_NAME, type DemoAttachment } from "./demoBoard";
import { daysBetween, statusOn } from "./metrics";
import { notificationSentence, splitThumbs, type NotificationItem } from "./notifications";

const EXCERPT = "Pode assumir esta? Os arquivos de referência estão anexados. Qualquer dúvida, me chama.";

type DueKind = "due_3d" | "due_1d" | "overdue";

function dueKind(t: DashboardTask, today: string): DueKind | null {
  if (!t.dueDay) return null;
  const left = daysBetween(today, t.dueDay);
  if (left >= 2 && left <= 3) return "due_3d";
  if (left === 1) return "due_1d";
  if (left >= -3 && left <= -1) return "overdue";
  return null;
}

export function demoNotifications(d: DashboardData, attachments: Map<string, DemoAttachment[]>): NotificationItem[] {
  const leader = d.people.find((p) => p.isLeader);
  const openOf = (p: DashboardPerson) => d.tasks.filter((t) => t.assigneeId === p.id && statusOn(t, d.today) !== "done");
  const candidates = d.people.filter((p) => !p.isLeader && openOf(p).length > 0);
  if (!leader || candidates.length === 0) return [];
  const kindsOf = (p: DashboardPerson) => new Set(openOf(p).map((t) => dueKind(t, d.today)).filter(Boolean)).size;
  const me = candidates.reduce((best, p) => (kindsOf(p) > kindsOf(best) ? p : best));
  const open = openOf(me);

  const at = (hoursAgo: number) => new Date(new Date(`${d.today}T12:00:00`).getTime() - hoursAgo * 3_600_000).toISOString();
  const item = (
    id: string,
    kind: NotificationKind,
    t: DashboardTask,
    extra: Partial<NotificationPayload>,
    opts: { fromLeader: boolean; read: boolean; hoursAgo: number; withExcerpt?: boolean },
  ): NotificationItem => {
    const payload: NotificationPayload = {
      card_title: t.title,
      board_name: DEMO_BOARD_NAME,
      actor_name: opts.fromLeader ? leader.name : null,
      actor_was_leader: opts.fromLeader,
      due_date: t.dueDay,
      ...extra,
    };
    const split = splitThumbs(
      (attachments.get(t.id) ?? []).map((a) => ({ id: a.id, name: a.name, url: null, isImage: a.kind === "image" })),
    );
    return {
      id: `demo-${id}`,
      kind,
      read: opts.read,
      at: at(opts.hoursAgo),
      actor: opts.fromLeader ? { id: leader.id, name: leader.name, avatarUrl: leader.avatarUrl ?? null, isLeader: true } : null,
      fromLeader: opts.fromLeader,
      sentence: notificationSentence(kind, payload, d.today),
      cardTitle: t.title,
      boardName: DEMO_BOARD_NAME,
      excerpt: opts.withExcerpt ? EXCERPT : "",
      thumbs: split.thumbs,
      extraThumbs: split.extra,
      boardId: null,
      cardId: null,
    };
  };

  const items: NotificationItem[] = [];
  // Atribuição: de preferência uma tarefa com anexos de exemplo.
  const assignedTask = open.find((t) => attachments.has(t.id)) ?? open[0];
  items.push(item("assigned", "assigned", assignedTask, {}, { fromLeader: true, read: false, hoursAgo: 1, withExcerpt: true }));

  const seen = new Set<DueKind>();
  open.forEach((t, i) => {
    const kind = dueKind(t, d.today);
    if (!kind || seen.has(kind)) return;
    seen.add(kind);
    items.push(item(`${kind}-${i}`, kind, t, { days_left: t.dueDay ? daysBetween(d.today, t.dueDay) : undefined }, {
      fromLeader: false, read: false, hoursAgo: 4 + i,
    }));
  });

  const changedTask = open.find((t) => t !== assignedTask) ?? assignedTask;
  items.push(item("changed", "changed", changedTask, { changes: ["due_date", "attachments"], attachments: 2 }, {
    fromLeader: true, read: true, hoursAgo: 30,
  }));

  return items.sort((a, b) => b.at.localeCompare(a.at));
}
