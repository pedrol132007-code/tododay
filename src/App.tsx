import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useBoards } from "./hooks/useBoards";
import { ArchiveView } from "./components/archive/ArchiveView";
import { BoardSwitcher } from "./components/board/BoardSwitcher";
import { BoardView } from "./components/board/BoardView";
import { CommandPalette } from "./components/search/CommandPalette";
import type { SearchResult } from "./types";

export default function App() {
  const { data: boards } = useBoards();
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pendingCardId, setPendingCardId] = useState<number | null>(null);

  useEffect(() => {
    if (activeBoardId === null && boards && boards.length > 0) {
      setActiveBoardId(boards[0].id);
    }
  }, [boards, activeBoardId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleNavigate(result: SearchResult) {
    setActiveBoardId(result.board_id);
    setShowArchive(false);
    setPendingCardId(result.type === "card" ? result.id : null);
    setPaletteOpen(false);
  }

  const activeBoard = boards?.find((board) => board.id === activeBoardId);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-bg-surface">
        <BoardSwitcher activeBoardId={activeBoardId} onSelect={setActiveBoardId} />
        {activeBoard && (
          <button
            type="button"
            onClick={() => setShowArchive((v) => !v)}
            className="mr-4 shrink-0 rounded-lg px-3 py-1 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
          >
            {showArchive ? "Board" : "Arquivados"}
          </button>
        )}
      </div>
      {activeBoard ? (
        showArchive ? (
          <ArchiveView boardId={activeBoard.id} boardName={activeBoard.name} onBack={() => setShowArchive(false)} />
        ) : (
          <BoardView
            boardId={activeBoard.id}
            boardName={activeBoard.name}
            initialSelectedCardId={pendingCardId}
            onInitialCardHandled={() => setPendingCardId(null)}
          />
        )
      ) : (
        <div className="flex flex-1 items-center justify-center text-text-muted">
          Nenhum board ainda.
        </div>
      )}
      <AnimatePresence>
        {paletteOpen && <CommandPalette onNavigate={handleNavigate} onClose={() => setPaletteOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
