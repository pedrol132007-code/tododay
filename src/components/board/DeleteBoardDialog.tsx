import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useBoardContents, useDeleteBoard } from "../../hooks/useBoards";
import type { Board } from "../../types";

interface DeleteBoardDialogProps {
  board: Board;
  onDeleted: () => void;
  onClose: () => void;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

/** Excluir apaga colunas, cards, etiquetas e checklists de uma vez: pede o nome do board para confirmar. */
export function DeleteBoardDialog({ board, onDeleted, onClose }: DeleteBoardDialogProps) {
  const { data: contents } = useBoardContents(board.id);
  const deleteBoard = useDeleteBoard(board.team_id);
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === board.name.trim();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleDelete() {
    if (!matches || deleteBoard.isPending) return;
    deleteBoard.mutate(board.id, { onSuccess: onDeleted });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-32">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-board-title"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.15 }}
        className="relative flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-bg-surface p-6"
      >
        <h2 id="delete-board-title" className="text-lg font-semibold text-text-primary">
          Excluir o board “{board.name}”?
        </h2>
        <p className="text-sm text-text-muted">
          {contents
            ? `Isso apaga ${plural(contents.lists, "coluna", "colunas")} e ${plural(contents.cards, "card", "cards")}, incluindo os arquivados. Não dá para desfazer.`
            : "Isso apaga todas as colunas e cards do board, incluindo os arquivados. Não dá para desfazer."}
        </p>
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Digite o nome do board para confirmar
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleDelete();
            }}
            placeholder={board.name}
            className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-text-primary outline-none focus:border-primary"
          />
        </label>
        {deleteBoard.error && <p className="text-sm text-danger">{(deleteBoard.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!matches || deleteBoard.isPending}
            className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-40"
          >
            {deleteBoard.isPending ? "Excluindo..." : "Excluir board"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
