import { useState } from "react";
import { useBoards, useCreateBoard } from "../../hooks/useBoards";
import { useCanEdit } from "../../hooks/useCanEdit";

interface BoardSwitcherProps {
  teamId: number;
  activeBoardId: number | null;
  onSelect: (boardId: number) => void;
}

export function BoardSwitcher({ teamId, activeBoardId, onSelect }: BoardSwitcherProps) {
  const { data: boards } = useBoards(teamId);
  const createBoard = useCreateBoard(teamId);
  const [creating, setCreating] = useState(false);
  const canEdit = useCanEdit();
  const [newBoardName, setNewBoardName] = useState("");

  function handleCreate() {
    const name = newBoardName.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    createBoard.mutate(name, {
      onSuccess: (id) => onSelect(id),
    });
    setNewBoardName("");
    setCreating(false);
  }

  return (
    <div className="flex flex-1 items-center gap-2 px-4 py-2">
      {(boards ?? []).map((board) => (
        <button
          key={board.id}
          type="button"
          onClick={() => onSelect(board.id)}
          className={`rounded-xl px-3 py-1 text-sm font-medium transition-colors ${
            board.id === activeBoardId
              ? "bg-accent-purple text-bg-base"
              : "text-text-muted hover:bg-bg-elevated"
          }`}
        >
          {board.name}
        </button>
      ))}
      {!canEdit ? null : creating ? (
        <input
          autoFocus
          value={newBoardName}
          onChange={(e) => setNewBoardName(e.target.value)}
          onBlur={handleCreate}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
            if (e.key === "Escape") setCreating(false);
          }}
          placeholder="Nome do board..."
          className="rounded-xl border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary outline-none focus:border-accent-purple"
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-xl px-3 py-1 text-sm text-text-muted hover:bg-bg-elevated"
          aria-label="Novo board"
        >
          + Novo board
        </button>
      )}
    </div>
  );
}
