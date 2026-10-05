import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useBoards, useCreateBoard, useRenameBoard } from "../../hooks/useBoards";
import { useIsAdmin } from "../../hooks/useCurrentTeam";
import { IconArchive, IconDots, IconPencil, IconPlus, IconTrash } from "../ui/icons";
import { DeleteBoardDialog } from "./DeleteBoardDialog";
import type { Board } from "../../types";

interface BoardSwitcherProps {
  teamId: number;
  activeBoardId: number | null;
  onSelect: (boardId: number) => void;
  onOpenArchive: () => void;
}

export function BoardSwitcher({ teamId, activeBoardId, onSelect, onOpenArchive }: BoardSwitcherProps) {
  const { data: boards } = useBoards(teamId);
  const createBoard = useCreateBoard(teamId);
  const renameBoard = useRenameBoard(teamId);
  const [creating, setCreating] = useState(false);
  const isAdmin = useIsAdmin();
  const [newBoardName, setNewBoardName] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState<Board | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleting, setDeleting] = useState<Board | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

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

  function startRename(board: Board) {
    setMenuOpen(false);
    setRenameDraft(board.name);
    setRenaming(board);
  }

  function commitRename() {
    const name = renameDraft.trim();
    if (renaming && name && name !== renaming.name) renameBoard.mutate({ id: renaming.id, name });
    setRenaming(null);
  }

  // Depois de excluir, abre o board vizinho (o seguinte, ou o anterior se era o último).
  function handleDeleted(board: Board) {
    const list = boards ?? [];
    const i = list.findIndex((b) => b.id === board.id);
    const neighbor = list[i + 1] ?? list[i - 1];
    setDeleting(null);
    if (neighbor) onSelect(neighbor.id);
  }

  return (
    <div className="flex flex-1 items-center gap-2 px-4 py-2">
      {(boards ?? []).map((board) => {
        const active = board.id === activeBoardId;
        if (renaming?.id === board.id) {
          return (
            <input
              key={board.id}
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(null);
              }}
              aria-label="Novo nome do board"
              className="rounded-xl border border-primary bg-bg-elevated px-2 py-1 text-sm text-text-primary outline-none"
            />
          );
        }
        return (
          <div
            key={board.id}
            ref={active ? menuRef : undefined}
            className={`relative flex items-center rounded-xl text-sm font-medium transition-colors ${
              active ? "bg-primary text-on-accent" : "text-text-muted hover:bg-bg-elevated"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(board.id)}
              onDoubleClick={() => active && isAdmin && startRename(board)}
              className={`py-1 ${active ? "pl-3 pr-1" : "px-3"}`}
            >
              {board.name}
            </button>
            {active && (
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label={`Opções do board ${board.name}`}
                aria-expanded={menuOpen}
                title="Opções do board"
                className="mr-1 rounded-lg p-1 opacity-80 hover:bg-on-accent/20 hover:opacity-100"
              >
                <IconDots size={14} />
              </button>
            )}
            {active && menuOpen && (
              <div className="absolute left-0 top-full z-40 mt-1 w-48 rounded-xl border border-border bg-bg-surface p-1 font-normal shadow-lg">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => startRename(board)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-elevated"
                  >
                    <IconPencil size={14} /> Renomear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenArchive();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-elevated"
                >
                  <IconArchive size={14} /> Arquivados
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setDeleting(board);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger hover:text-on-accent"
                  >
                    <IconTrash size={14} /> Excluir board
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {!isAdmin ? null : creating ? (
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
          className="rounded-xl border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary outline-none focus:border-primary"
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1 rounded-xl px-3 py-1 text-sm text-text-muted hover:bg-bg-elevated"
          aria-label="Novo board"
        >
          <IconPlus size={14} /> Novo board
        </button>
      )}
      <AnimatePresence>
        {deleting && (
          <DeleteBoardDialog board={deleting} onDeleted={() => handleDeleted(deleting)} onClose={() => setDeleting(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
