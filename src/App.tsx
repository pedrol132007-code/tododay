import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useBoards } from "./hooks/useBoards";
import { useMyTeams } from "./hooks/useTeams";
import { useRealtimeSync } from "./hooks/useRealtimeSync";
import { ArchiveView } from "./components/archive/ArchiveView";
import { BoardSwitcher } from "./components/board/BoardSwitcher";
import { BoardView } from "./components/board/BoardView";
import { UserMenu } from "./components/auth/UserMenu";
import { CommandPalette } from "./components/search/CommandPalette";
import { NoTeamScreen } from "./components/team/NoTeamScreen";
import { TeamSwitcher } from "./components/team/TeamSwitcher";
import { TeamView } from "./components/team/TeamView";
import { InviteScreen } from "./components/team/InviteScreen";
import { clearPendingInvite, getPendingInvite } from "./lib/pendingInvite";
import { CurrentTeamContext } from "./hooks/useCurrentTeam";
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
  const [inviteToken, setInviteToken] = useState(getPendingInvite);

  function selectTeam(teamId: number) {
    setSelectedTeamId(teamId);
    storeTeamId(teamId);
  }

  if (inviteToken) {
    return (
      <InviteScreen
        token={inviteToken}
        onDone={(teamId) => {
          clearPendingInvite();
          setInviteToken(null);
          if (teamId !== null) selectTeam(teamId);
        }}
      />
    );
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
  const [view, setView] = useState<"board" | "archive" | "team">("board");
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
    setActiveBoardId(id);
    setPendingCardId(null);
    setPendingListId(null);
  }

  const activeBoard = boards?.find((board) => board.id === activeBoardId);
  useRealtimeSync(team.id, activeBoard?.id ?? null);

  return (
    <CurrentTeamContext.Provider value={{ teamId: team.id, canEdit: team.role !== "viewer" }}>
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-bg-surface">
        <TeamSwitcher userId={userId} teams={teams} activeTeamId={team.id} onSelect={onSelectTeam} />
        <div className="h-5 w-px shrink-0 bg-border" />
        <BoardSwitcher teamId={team.id} activeBoardId={activeBoardId} onSelect={handleSelectBoard} />
        {activeBoard && view !== "team" && (
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
          onClick={() => setView((v) => (v === "team" ? "board" : "team"))}
          className={`mx-2 shrink-0 rounded-lg px-3 py-1 text-sm hover:bg-bg-elevated hover:text-text-primary ${
            view === "team" ? "text-text-primary" : "text-text-muted"
          }`}
        >
          Equipe
        </button>
        <UserMenu userId={userId} />
      </div>
      {view === "team" ? (
        <TeamView userId={userId} team={team} onBack={() => setView("board")} />
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
        {paletteOpen && <CommandPalette teamId={team.id} onNavigate={handleNavigate} onClose={() => setPaletteOpen(false)} />}
      </AnimatePresence>
    </div>
    </CurrentTeamContext.Provider>
  );
}
