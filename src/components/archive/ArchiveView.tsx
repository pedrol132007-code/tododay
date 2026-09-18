import { useState } from "react";
import { motion } from "framer-motion";
import { useArchivedCards, useDeleteCardPermanently, useRestoreCard } from "../../hooks/useCards";

interface ArchiveViewProps {
  boardId: number;
  boardName: string;
  onBack: () => void;
}

export function ArchiveView({ boardId, boardName, onBack }: ArchiveViewProps) {
  const { data: cards } = useArchivedCards(boardId);
  const restoreCard = useRestoreCard(boardId);
  const deleteCardPermanently = useDeleteCardPermanently(boardId);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-6 flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-3 py-1 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
        >
          ← Voltar
        </button>
        <h1 className="text-2xl font-semibold text-text-primary">Arquivados — {boardName}</h1>
      </div>

      {(cards ?? []).length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-text-muted">
          Nenhum card arquivado.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(cards ?? []).map((card) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-between gap-2 rounded-xl border border-border bg-bg-elevated px-3 py-2"
            >
              <span className="flex-1 text-text-primary">{card.title}</span>
              <button
                type="button"
                onClick={() => restoreCard.mutate(card.id)}
                className="rounded-lg px-3 py-1 text-sm text-accent-purple hover:bg-bg-surface"
              >
                Restaurar
              </button>
              <button
                type="button"
                onBlur={() => setConfirmingId(null)}
                onClick={() => {
                  if (confirmingId === card.id) {
                    deleteCardPermanently.mutate(card.id);
                    setConfirmingId(null);
                  } else {
                    setConfirmingId(card.id);
                  }
                }}
                className={`rounded-lg px-3 py-1 text-sm hover:bg-accent-pink hover:text-bg-base ${
                  confirmingId === card.id ? "bg-accent-pink text-bg-base" : "text-text-muted"
                }`}
              >
                {confirmingId === card.id ? "Confirmar exclusão?" : "Excluir"}
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
