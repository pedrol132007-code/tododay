import { supabase } from "./supabase";

export type RealtimeTable = "board" | "list" | "card" | "label" | "card_label" | "checklist_item";

/**
 * Avisa (só o nome da tabela) quando algo muda nos boards da equipe ou no board aberto.
 * card_label e checklist_item não têm board_id, então chegam de qualquer board da equipe
 * (a RLS corta o resto). Devolve a função que cancela a assinatura.
 */
export function subscribeToChanges(
  teamId: number,
  boardId: number | null,
  onChange: (table: RealtimeTable) => void,
): () => void {
  const channel = supabase.channel(`team-${teamId}-board-${boardId ?? "none"}`);
  const listen = (table: RealtimeTable, filter?: string) =>
    channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, () => onChange(table));

  listen("board", `team_id=eq.${teamId}`);
  if (boardId !== null) {
    listen("list", `board_id=eq.${boardId}`);
    listen("card", `board_id=eq.${boardId}`);
    listen("label", `board_id=eq.${boardId}`);
    listen("card_label");
    listen("checklist_item");
  }
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
