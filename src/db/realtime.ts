import { supabase } from "./supabase";

export type RealtimeTable = "board" | "list" | "card" | "label" | "card_label" | "checklist_item" | "card_attachment" | "activity" | "notification" | "board_member" | "team_member";

/**
 * Avisa (só o nome da tabela) quando algo muda nos boards da equipe, no board aberto ou nas notificações da pessoa.
 * card_label e checklist_item não têm board_id, então chegam de qualquer board da equipe
 * (a RLS corta o resto). Devolve a função que cancela a assinatura.
 */
export function subscribeToChanges(
  teamId: number,
  boardId: number | null,
  userId: string,
  onChange: (table: RealtimeTable) => void,
): () => void {
  const channel = supabase.channel(`team-${teamId}-board-${boardId ?? "none"}-user-${userId}`);
  const listen = (table: RealtimeTable, filter?: string) =>
    channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, () => onChange(table));

  listen("board", `team_id=eq.${teamId}`);
  listen("activity", `team_id=eq.${teamId}`);
  // As notificações da pessoa, em qualquer board (a RLS também só entrega as dela).
  listen("notification", `user_id=eq.${userId}`);
  // Entrar num board (0020) faz ele aparecer na lista. (O Realtime não filtra saídas; quem sai
  // deixa de ver o conteúdo pela RLS e o board some na próxima busca.)
  listen("board_member", `user_id=eq.${userId}`);
  // Ganhar ou perder a coroa (ou o papel) muda o que a pessoa vê e pode fazer.
  listen("team_member", `user_id=eq.${userId}`);
  if (boardId !== null) {
    listen("list", `board_id=eq.${boardId}`);
    listen("card", `board_id=eq.${boardId}`);
    listen("label", `board_id=eq.${boardId}`);
    listen("card_attachment", `board_id=eq.${boardId}`);
    listen("card_label");
    listen("checklist_item");
  }
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
