import { describe, expect, it } from "vitest";
import type { AppNotification, NotificationPayload } from "../types";
import {
  bellLabel,
  excerptOf,
  filterNotifications,
  joinPt,
  notificationSentence,
  splitThumbs,
  toNotificationItem,
  type NotificationItem,
  type NotificationThumb,
} from "./notifications";

const TODAY = "2026-10-07";
const base: NotificationPayload = { card_title: "Relatório", board_name: "Operações", actor_name: "Ana Souza", actor_was_leader: false, due_date: "2026-10-10" };

describe("joinPt", () => {
  it("junta com vírgula e 'e'", () => {
    expect(joinPt(["a"])).toBe("a");
    expect(joinPt(["a", "b"])).toBe("a e b");
    expect(joinPt(["a", "b", "c"])).toBe("a, b e c");
  });
});

describe("notificationSentence", () => {
  it("atribuição", () => {
    expect(notificationSentence("assigned", base, TODAY)).toBe("Ana Souza atribuiu a você");
    expect(notificationSentence("assigned", { ...base, actor_name: null }, TODAY)).toBe("Atribuído a você");
  });
  it("avisos de prazo", () => {
    expect(notificationSentence("due_3d", { ...base, days_left: 3 }, TODAY)).toBe("Vence em 3 dias");
    expect(notificationSentence("due_3d", { ...base, days_left: 2 }, TODAY)).toBe("Vence em 2 dias");
    expect(notificationSentence("due_1d", base, TODAY)).toBe("Vence amanhã");
  });
  it("atraso conta a partir do prazo, não da notificação", () => {
    expect(notificationSentence("overdue", { ...base, due_date: "2026-10-06" }, TODAY)).toBe("Atrasou: venceu ontem");
    expect(notificationSentence("overdue", { ...base, due_date: "2026-10-02" }, TODAY)).toBe("Atrasada há 5 dias");
  });
  it("mudanças agrupadas", () => {
    expect(notificationSentence("changed", { ...base, changes: ["due_date"] }, TODAY)).toBe("Ana Souza mudou o prazo");
    expect(
      notificationSentence("changed", { ...base, changes: ["due_date", "attachments", "list"], attachments: 2, list_name: "Fazendo" }, TODAY),
    ).toBe("Ana Souza mudou o prazo, moveu para Fazendo e anexou 2 arquivos");
    expect(notificationSentence("changed", { ...base, changes: ["attachments"], attachments: 1 }, TODAY)).toBe("Ana Souza anexou 1 arquivo");
    expect(notificationSentence("changed", { ...base, changes: ["description"] }, TODAY)).toBe("Ana Souza editou a descrição");
  });
});

describe("splitThumbs", () => {
  const t = (i: number): NotificationThumb => ({ id: String(i), name: `${i}.png`, url: null, isImage: true });
  it("mostra até 4 e conta o resto", () => {
    expect(splitThumbs([1, 2, 3].map(t))).toEqual({ thumbs: [1, 2, 3].map(t), extra: 0 });
    expect(splitThumbs([1, 2, 3, 4, 5, 6].map(t))).toEqual({ thumbs: [1, 2, 3, 4].map(t), extra: 2 });
  });
});

describe("excerptOf", () => {
  it("tira markdown simples e corta em 160 caracteres", () => {
    expect(excerptOf("## Título\n\n**Pode** assumir?")).toBe("Título Pode assumir?");
    expect(excerptOf("x".repeat(200))).toBe(`${"x".repeat(159)}…`);
    expect(excerptOf(null)).toBe("");
  });
});

describe("bellLabel", () => {
  it("sem não lidas não mostra nada; acima de 9 vira 9+", () => {
    expect(bellLabel(0)).toBeNull();
    expect(bellLabel(3)).toBe("3");
    expect(bellLabel(9)).toBe("9");
    expect(bellLabel(10)).toBe("9+");
  });
});

const row = (over: Partial<AppNotification & { card: { description: string; archived_at: string | null } | null }> = {}) => ({
  id: 7,
  user_id: "u",
  team_id: 1,
  board_id: 2,
  card_id: 3,
  actor_id: "a",
  kind: "assigned" as const,
  due_key: null,
  payload: { ...base, actor_was_leader: true },
  created_at: "2026-10-07T10:00:00Z",
  updated_at: "2026-10-07T11:00:00Z",
  read_at: null,
  card: { description: "Pode assumir?", archived_at: null },
  ...over,
}) as AppNotification & { card: { description: string; archived_at: string | null } | null };

describe("toNotificationItem", () => {
  it("monta o item com o ator atual e o destaque de líder da época", () => {
    const item = toNotificationItem(row(), { name: "Ana S.", avatarUrl: "https://x/a.webp" }, [], TODAY);
    expect(item).toMatchObject({
      id: "7",
      read: false,
      at: "2026-10-07T11:00:00Z",
      fromLeader: true,
      actor: { id: "a", name: "Ana S.", avatarUrl: "https://x/a.webp", isLeader: true },
      sentence: "Ana Souza atribuiu a você",
      cardTitle: "Relatório",
      boardName: "Operações",
      excerpt: "Pode assumir?",
      boardId: 2,
      cardId: 3,
    });
  });
  it("quem saiu da equipe aparece com o nome da época, sem foto", () => {
    const item = toNotificationItem(row(), null, [], TODAY);
    expect(item.actor).toEqual({ id: "a", name: "Ana Souza", avatarUrl: null, isLeader: true });
  });
  it("card apagado ou arquivado fica sem link", () => {
    expect(toNotificationItem(row({ card_id: null, card: null }), null, [], TODAY).cardId).toBeNull();
    expect(toNotificationItem(row({ card: { description: "", archived_at: "2026-10-01T00:00:00Z" } }), null, [], TODAY).cardId).toBeNull();
  });
  it("aviso do sistema não tem ator", () => {
    const item = toNotificationItem(row({ kind: "due_1d", actor_id: null, payload: { ...base, actor_name: null } }), null, [], TODAY);
    expect(item.actor).toBeNull();
    expect(item.fromLeader).toBe(false);
  });
});

describe("filterNotifications", () => {
  const item = (id: string, read: boolean, fromLeader: boolean) => ({ id, read, fromLeader }) as NotificationItem;
  const items = [item("1", false, true), item("2", true, false), item("3", false, false)];
  it("filtra por não lidas e por líder", () => {
    expect(filterNotifications(items, "all").map((i) => i.id)).toEqual(["1", "2", "3"]);
    expect(filterNotifications(items, "unread").map((i) => i.id)).toEqual(["1", "3"]);
    expect(filterNotifications(items, "leader").map((i) => i.id)).toEqual(["1"]);
  });
});
