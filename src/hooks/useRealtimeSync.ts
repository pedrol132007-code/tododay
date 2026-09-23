import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { subscribeToChanges, type RealtimeTable } from "../db/realtime";

/**
 * Mantém a tela em dia com o que os outros fazem: cada evento do Realtime invalida as
 * queries afetadas e o React Query busca de novo. Um rebalanceamento gera dezenas de
 * eventos seguidos, então eles são agrupados antes de invalidar.
 */
export function useRealtimeSync(teamId: number, boardId: number | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const keysFor = (table: RealtimeTable): QueryKey[] => {
      switch (table) {
        case "board":
          return [["boards", teamId], ["search"]];
        case "list":
          return [["lists", boardId], ["search"]];
        case "card":
          return [["cards"], ["cardCount"], ["archivedCards", boardId], ["search"]];
        case "label":
          return [["labels", boardId], ["cardLabels"], ["labelsForCards"]];
        case "card_label":
          return [["cardLabels"], ["labelsForCards"]];
        case "checklist_item":
          return [["checklistItems"], ["checklistProgress"]];
      }
    };

    const pending = new Set<RealtimeTable>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      for (const table of pending) {
        for (const queryKey of keysFor(table)) void queryClient.invalidateQueries({ queryKey });
      }
      pending.clear();
    };

    const unsubscribe = subscribeToChanges(teamId, boardId, (table) => {
      pending.add(table);
      timer ??= setTimeout(flush, 150);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [queryClient, teamId, boardId]);
}
