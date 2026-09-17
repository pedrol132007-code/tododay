import { motion } from "framer-motion";
import { useBoards } from "../../hooks/useBoards";

export function BoardView() {
  const { data: boards, isLoading, error } = useBoards();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        Carregando...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-accent-pink">
        Erro ao carregar boards: {(error as Error).message}
      </div>
    );
  }

  const board = boards?.[0];

  if (!board) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        Nenhum board ainda.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex h-full flex-col p-6"
    >
      <h1 className="text-2xl font-semibold text-text-primary">{board.name}</h1>
      <div className="mt-6 flex-1 rounded-2xl border border-border bg-bg-surface p-6 text-text-muted">
        Nenhuma lista ainda.
      </div>
    </motion.div>
  );
}
