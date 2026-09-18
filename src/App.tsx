import { useEffect, useState } from "react";
import { useBoards } from "./hooks/useBoards";
import { ArchiveView } from "./components/archive/ArchiveView";
import { BoardSwitcher } from "./components/board/BoardSwitcher";
import { BoardView } from "./components/board/BoardView";

export default function App() {
  const { data: boards } = useBoards();
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  useEffect(() => {
    if (activeBoardId === null && boards && boards.length > 0) {
      setActiveBoardId(boards[0].id);
    }
  }, [boards, activeBoardId]);

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
          <BoardView boardId={activeBoard.id} boardName={activeBoard.name} />
        )
      ) : (
        <div className="flex flex-1 items-center justify-center text-text-muted">
          Nenhum board ainda.
        </div>
      )}
    </div>
  );
}
