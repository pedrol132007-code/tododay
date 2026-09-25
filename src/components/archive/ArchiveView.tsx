import { useState } from "react";
import { motion } from "framer-motion";
import { useArchivedCards, useDeleteCardPermanently, useRestoreCard } from "../../hooks/useCards";
import { useCanEdit } from "../../hooks/useCurrentTeam";
import { IconArchive } from "../ui/icons";
import { EmptyState } from "../ui/EmptyState";
import { PageHeader } from "../ui/PageHeader";

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
  const canEdit = useCanEdit();

  return (
    <div className="flex h-full flex-col p-6">
      <PageHeader eyebrow="Arquivados" title={boardName} onBack={onBack} />

      {(cards ?? []).length === 0 ? (
        <div className="flex flex-1 items-start justify-center">
          <EmptyState
            icon={<IconArchive size={22} />}
            title="Nenhum card arquivado"
            description="Cards arquivados neste board aparecem aqui e podem ser restaurados."
          />
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
              {canEdit && (
              <>
              <button
                type="button"
                onClick={() => restoreCard.mutate(card.id)}
                className="rounded-lg px-3 py-1 text-sm text-primary hover:bg-bg-surface"
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
                className={`rounded-lg px-3 py-1 text-sm hover:bg-danger hover:text-on-accent ${
                  confirmingId === card.id ? "bg-danger text-on-accent" : "text-text-muted"
                }`}
              >
                {confirmingId === card.id ? "Confirmar exclusão?" : "Excluir"}
              </button>
              </>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
