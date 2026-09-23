import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useBoards } from "./hooks/useBoards";
import { ArchiveView } from "./components/archive/ArchiveView";
import { BoardSwitcher } from "./components/board/BoardSwitcher";
import { BoardView } from "./components/board/BoardView";
import { SettingsView } from "./components/settings/SettingsView";
import { TeamView } from "./components/team/TeamView";
import { CommandPalette } from "./components/search/CommandPalette";
import type { SearchResult } from "./types";

export default function App() {
  const { data: boards } = useBoards();
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [view, setView] = useState<"board" | "archive" | "team" | "settings">("board");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pendingCardId, setPendingCardId] = useState<number | null>(null);
  const [pendingListId, setPendingListId] = useState<number | null>(null);

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
    setView("board");
    setPendingCardId(result.type === "card" ? result.id : null);
    setPendingListId(result.type === "list" ? result.id : null);
    setPaletteOpen(false);
  }

  // A manual board switch means any search-navigation target still pending is stale — if the
  // target board's lists hadn't finished loading yet, BoardView never got the chance to consume
  // it, and without this it would sit in state and could fire a highlight later, on whatever
  // future board happens to contain a list with that same id.
  function handleSelectBoard(id: number) {
    setView((v) => (v === "team" || v === "settings" ? "board" : v));
    setActiveBoardId(id);
    setPendingCardId(null);
    setPendingListId(null);
  }

  const activeBoard = boards?.find((board) => board.id === activeBoardId);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-bg-surface">
        <button
          type="button"
          onClick={() => setView((v) => (v === "team" ? "board" : "team"))}
          aria-label="Equipe"
          aria-pressed={view === "team"}
          title="Equipe"
          className={`ml-4 shrink-0 rounded-lg p-1.5 transition-colors ${
            view === "team" ? "bg-accent text-on-accent" : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
          }`}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </button>
        <BoardSwitcher activeBoardId={activeBoardId} onSelect={handleSelectBoard} />
        <div className="mr-4 flex shrink-0 items-center gap-1">
          {activeBoard && view !== "team" && view !== "settings" && (
            <button
              type="button"
              onClick={() => setView((v) => (v === "archive" ? "board" : "archive"))}
              className="shrink-0 rounded-lg px-3 py-1 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            >
              {view === "archive" ? "Board" : "Arquivados"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setView((v) => (v === "settings" ? "board" : "settings"))}
            aria-label="Configurações"
            aria-pressed={view === "settings"}
            title="Configurações"
            className={`shrink-0 rounded-lg p-1.5 transition-colors ${
              view === "settings" ? "bg-accent text-on-accent" : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            }`}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>
      {view === "settings" ? (
        <SettingsView onBack={() => setView("board")} />
      ) : view === "team" ? (
        <TeamView onBack={() => setView("board")} />
      ) : activeBoard ? (
        view === "archive" ? (
          <ArchiveView boardId={activeBoard.id} boardName={activeBoard.name} onBack={() => setView("board")} />
        ) : (
          <BoardView
            boardId={activeBoard.id}
            boardName={activeBoard.name}
            initialSelectedCardId={pendingCardId}
            onInitialCardHandled={() => setPendingCardId(null)}
            initialHighlightListId={pendingListId}
            onInitialListHandled={() => setPendingListId(null)}
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
