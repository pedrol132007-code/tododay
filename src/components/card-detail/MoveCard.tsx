import { useEffect, useRef, useState } from "react";
import type { Card } from "../../types";
import { useCards, useMoveCardToList } from "../../hooks/useCards";
import { useLists } from "../../hooks/useLists";
import { edgePosition } from "../../lib/position";
import { useToast } from "../ui/Toast";

/**
 * "Mover para…" do painel do card: outra coluna do mesmo board (ou a mesma), no topo ou no fim.
 * É o que o arrastar faz, sem arrastar (teclado, tela pequena, coluna longe). Entre boards, não:
 * as etiquetas são de cada board e precisariam ir junto, no banco.
 */
export function MoveCard({ card }: { card: Card }) {
  const [open, setOpen] = useState(false);
  const [listId, setListId] = useState(card.list_id);
  const [edge, setEdge] = useState<"top" | "end">("end");
  const ref = useRef<HTMLDivElement>(null);
  const { data: lists } = useLists(card.board_id);
  const { data: target } = useCards(listId);
  const move = useMoveCardToList();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setListId(card.list_id);
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, card.list_id]);

  function submit() {
    if (!target) return;
    const name = lists?.find((l) => l.id === listId)?.name ?? "";
    move.mutate(
      { id: card.id, listId, position: edgePosition(target, edge, card.id) },
      { onSuccess: () => toast({ message: `Movido para “${name}”` }) },
    );
    setOpen(false);
  }

  return (
    <div
      ref={ref}
      className="relative"
      // Esc fecha só o painel de mover, não o do card.
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-lg border border-border px-2.5 py-1 text-sm text-text-primary transition-colors hover:border-primary hover:text-primary"
      >
        Mover
      </button>
      {open && (
        <form
          className="absolute right-0 top-full z-30 mt-1 flex w-64 flex-col gap-3 rounded-xl border border-border bg-bg-surface p-3 shadow-lg"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Coluna
            <select
              aria-label="Coluna de destino"
              value={listId}
              onChange={(e) => setListId(Number(e.target.value))}
              className="rounded-lg border border-border bg-bg-elevated px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-text-primary outline-none focus:border-primary"
            >
              {(lists ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.id === card.list_id ? `${l.name} (atual)` : l.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="pb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">Posição</legend>
            {(["top", "end"] as const).map((value) => (
              <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                <input type="radio" name="move-edge" checked={edge === value} onChange={() => setEdge(value)} className="accent-primary" />
                {value === "top" ? "No topo" : "No fim"}
              </label>
            ))}
          </fieldset>
          <button type="submit" disabled={!target || move.isPending} className="btn-primary py-1.5 disabled:opacity-40">
            Mover card
          </button>
        </form>
      )}
    </div>
  );
}
