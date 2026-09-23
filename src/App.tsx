import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useBoards } from "./hooks/useBoards";
import { useMyTeams } from "./hooks/useTeams";
import { ArchiveView } from "./components/archive/ArchiveView";
import { BoardSwitcher } from "./components/board/BoardSwitcher";
import { BoardView } from "./components/board/BoardView";
import { UserMenu } from "./components/auth/UserMenu";
import { CommandPalette } from "./components/search/CommandPalette";
import { NoTeamScreen } from "./components/team/NoTeamScreen";
import { TeamSwitcher } from "./components/team/TeamSwitcher";
import type { MyTeam, SearchResult } from "./types";

const ACTIVE_TEAM_KEY = "tododay.activeTeamId";

function readStoredTeamId(): number | null {
  try {
    const value = localStorage.getItem(ACTIVE_TEAM_KEY);
    return value ? Number(value) : null;
  } catch {
    return null;
  }
}

function storeTeamId(teamId: number) {
  try {
    localStorage.setItem(ACTIVE_TEAM_KEY, String(teamId));
  } catch {
    // Só uma conveniência: sem storage, o app abre na primeira equipe.
  }
}

export default function App({ userId }: { userId: string }) {
  const { data: teams, isError, refetch } = useMyTeams(userId);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(readStoredTeamId);

  function selectTeam(teamId: number) {
    setSelectedTeamId(teamId);
    storeTeamId(teamId);
  }

  if (isError) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-bg-base text-text-muted">
        Não foi possível carregar suas equipes.
        <button type="button" onClick={() => refetch()} className="text-accent-purple hover:underline">
          Tentar de novo
        </button>
      </div>
    );
  }
  if (!teams) {
    return <div className="h-screen w-screen bg-bg-base" />;
  }
  if (teams.length === 0) {
    return <NoTeamScreen userId={userId} onCreated={selectTeam} />;
  }

  const activeTeam = teams.find((team) => team.id === selectedTeamId) ?? teams[0];
  // key: trocar de equipe zera board ativo, arquivo e navegação pendente da busca.
  return <TeamWorkspace key={activeTeam.id} userId={userId} teams={teams} team={activeTeam} onSelectTeam={selectTeam} />;
}

interface TeamWorkspaceProps {
  userId: string;
  teams: MyTeam[];
  team: MyTeam;
  onSelectTeam: (teamId: number) => void;
}

function TeamWorkspace({ userId, teams, team, onSelectTeam }: TeamWorkspaceProps) {
  const { data: boards } = useBoards(team.id);
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [showArchive, setShowArchive] = useState(false);
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
    setShowArchive(false);
    setPendingCardId(result.type === "card" ? result.id : null);
    setPendingListId(result.type === "list" ? result.id : null);
    setPaletteOpen(false);
  }

  // A manual board switch means any search-navigation target still pending is stale — if the
  // target board's lists hadn't finished loading yet, BoardView never got the chance to consume
  // it, and without this it would sit in state and could fire a highlight later, on whatever
  // future board happens to contain a list with that same id.
  function handleSelectBoard(id: number) {
    setActiveBoardId(id);
    setPendingCardId(null);
    setPendingListId(null);
  }

  const activeBoard = boards?.find((board) => board.id === activeBoardId);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-bg-surface">
        <TeamSwitcher userId={userId} teams={teams} activeTeamId={team.id} onSelect={onSelectTeam} />
        <div className="h-5 w-px shrink-0 bg-border" />
        <BoardSwitcher teamId={team.id} activeBoardId={activeBoardId} onSelect={handleSelectBoard} />
        {activeBoard && (
          <button
            type="button"
            onClick={() => setShowArchive((v) => !v)}
            className="mr-4 shrink-0 rounded-lg px-3 py-1 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
          >
            {showArchive ? "Board" : "Arquivados"}
          </button>
        )}
        <UserMenu userId={userId} />
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
        {paletteOpen && <CommandPalette teamId={team.id} onNavigate={handleNavigate} onClose={() => setPaletteOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
